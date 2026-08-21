'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { dialFor, dialOptions, type DialOption } from '@/lib/phone';

/**
 * A country code menu the site actually owns.
 *
 * A native <select> sized itself to its longest country name, which is what
 * made the two boxes different widths, and it opened an operating system menu
 * that no stylesheet can reach: no hover state, no search, no flags on some
 * platforms. This is a listbox instead, so the field is one compound control
 * with a single border and a single height, and the menu can be searched with
 * the keyboard.
 *
 * The menu is rendered into <body> and placed at the field's screen position.
 * Inside the card it was clipped by the frame that tweens the card height, and
 * focusing the search box then scrolled that clipped frame, which is what made
 * the question jump upwards. Fixed, in a portal, it belongs to no clipping
 * context at all. It also mounts closed and opens on the next frame, so the
 * transition has a state to move from instead of appearing at once.
 */

export type PhoneLabels = {
  choose: string;
  search: string;
  common: string;
  all: string;
  empty: string;
};

type Props = {
  id: string;
  country: string;
  onCountryChange: (country: string) => void;
  value: string;
  onValueChange: (value: string) => void;
  onEnter: () => void;
  invalid: boolean;
  placeholder: string;
  localeTag: string;
  labels: PhoneLabels;
  autoFocus?: boolean;
};

/** Matches --dropdown-close-dur in phone-field.css. */
const CLOSE_MS = 150;
/** Enough room for the search box and a few rows before the menu flips up. */
const MENU_SPACE = 300;

type Anchor = {
  left: number;
  width: number;
  drop: 'down' | 'up';
  /** Distance from the top of the viewport, or from its bottom when flipped. */
  offset: number;
};

export function PhoneField({
  id,
  country,
  onCountryChange,
  value,
  onValueChange,
  onEnter,
  invalid,
  placeholder,
  localeTag,
  labels,
  autoFocus,
}: Props) {
  const menuId = useId();
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState(false);
  const [closing, setClosing] = useState(false);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  const fieldRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const numberRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const { priority, rest } = useMemo(() => dialOptions(localeTag), [localeTag]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (needle === '') return { priority, rest };

    const matches = (option: DialOption) =>
      option.name.toLowerCase().includes(needle) ||
      option.country.toLowerCase().includes(needle) ||
      option.dial.startsWith(needle.replace(/^\+/, ''));

    return { priority: priority.filter(matches), rest: rest.filter(matches) };
  }, [priority, rest, query]);

  // One flat list so the arrow keys can walk both groups without caring where
  // the separator is.
  const walkable = useMemo(
    () => [...filtered.priority, ...filtered.rest],
    [filtered.priority, filtered.rest],
  );

  useEffect(() => setActiveIndex(0), [query]);

  /* --- where the menu goes ------------------------------------------------ */

  const place = useCallback(() => {
    const box = fieldRef.current?.getBoundingClientRect();
    if (!box) return;

    const below = window.innerHeight - box.bottom;
    const drop: 'down' | 'up' = below < MENU_SPACE && box.top > below ? 'up' : 'down';

    setAnchor({
      left: box.left,
      width: box.width,
      drop,
      offset: drop === 'down' ? box.bottom + 6 : window.innerHeight - box.top + 6,
    });
  }, []);

  useEffect(() => {
    if (!open) return;

    // Capture, so a scroll inside any ancestor moves the menu with the field.
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open, place]);

  /* --- opening and closing ------------------------------------------------ */

  function openMenu() {
    place();
    setClosing(false);
    setOpen(true);
  }

  // Mounted first, opened on the frame after, so the transition has somewhere
  // to come from. Two frames: one for the mount, one for the style to settle.
  useEffect(() => {
    if (!open) return;
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setShown(true));
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [open]);

  const close = useCallback((giveFocusBack: boolean) => {
    setShown(false);
    setClosing(true);
    setQuery('');
    window.setTimeout(() => {
      setOpen(false);
      setClosing(false);
    }, CLOSE_MS);
    if (giveFocusBack) numberRef.current?.focus({ preventScroll: true });
  }, []);

  function choose(option: DialOption) {
    onCountryChange(option.country);
    close(true);
  }

  // Clicking anywhere else, or pressing Escape, puts the menu away. The menu
  // lives in <body>, so it needs its own containment test.
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (fieldRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      close(false);
    };
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') close(true);
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);

  useEffect(() => {
    if (shown) searchRef.current?.focus({ preventScroll: true });
  }, [shown]);

  // Keep the highlighted country in view while the arrows move down the list.
  useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, open]);

  function onSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((current) => Math.min(current + 1, walkable.length - 1));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((current) => Math.max(current - 1, 0));
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const option = walkable[activeIndex];
      if (option) choose(option);
    }
  }

  // The index is passed in rather than looked up: with 225 countries, one
  // indexOf per row is 225 scans of the same array on every keystroke.
  function renderOption(option: DialOption, index: number) {
    return (
      <button
        key={option.country}
        type="button"
        role="option"
        data-index={index}
        data-active={index === activeIndex || undefined}
        aria-selected={option.country === country}
        onClick={() => choose(option)}
        onMouseEnter={() => setActiveIndex(index)}
        className="phone-option"
      >
        <span className="phone-flag" aria-hidden="true">
          {option.flag}
        </span>
        <span className="phone-option-name">{option.name}</span>
        <span className="phone-option-dial">+{option.dial}</span>
      </button>
    );
  }

  const selected = useMemo(
    () => [...priority, ...rest].find((option) => option.country === country),
    [priority, rest, country],
  );

  const menu =
    open && anchor ? (
      <div
        ref={menuRef}
        id={menuId}
        role="listbox"
        aria-label={labels.choose}
        data-drop={anchor.drop}
        className={`phone-menu t-dropdown ${shown ? 'is-open' : closing ? 'is-closing' : ''}`}
        style={{
          left: `${anchor.left}px`,
          width: `${anchor.width}px`,
          ...(anchor.drop === 'down'
            ? { top: `${anchor.offset}px` }
            : { bottom: `${anchor.offset}px` }),
        }}
      >
        <div className="phone-search">
          <svg className="phone-search-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
            <path d="M16.5 16.5 21 21" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onSearchKeyDown}
            placeholder={labels.search}
            aria-label={labels.search}
            className="phone-search-input"
          />
        </div>

        <div ref={listRef} className="phone-list">
          {walkable.length === 0 ? <p className="phone-empty">{labels.empty}</p> : null}

          {filtered.priority.length > 0 ? (
            <>
              <p className="phone-group">{labels.common}</p>
              {filtered.priority.map((option, index) => renderOption(option, index))}
            </>
          ) : null}

          {filtered.priority.length > 0 && filtered.rest.length > 0 ? (
            <div className="phone-separator" aria-hidden="true" />
          ) : null}

          {filtered.rest.length > 0 ? <p className="phone-group">{labels.all}</p> : null}
          {filtered.rest.map((option, index) =>
            renderOption(option, filtered.priority.length + index),
          )}
        </div>
      </div>
    ) : null;

  return (
    <div
      ref={fieldRef}
      className={`phone-field ${open ? 'is-open' : ''} ${invalid ? 'is-error' : ''}`}
    >
      <button
        type="button"
        className={`phone-country ${open ? 'is-open' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`${labels.choose}${selected ? `, ${selected.name}` : ''}`}
        onClick={() => (open ? close(true) : openMenu())}
      >
        <span className="phone-flag" aria-hidden="true">
          {selected?.flag ?? country}
        </span>
        <span className="phone-dial">+{dialFor(country)}</span>
        <svg className="phone-chevron" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path
            d="M6 9l6 6 6-6"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      <input
        ref={numberRef}
        id={id}
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        placeholder={placeholder}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter') return;
          event.preventDefault();
          onEnter();
        }}
        aria-invalid={invalid ? 'true' : undefined}
        className="phone-number"
        data-autofocus={autoFocus ? true : undefined}
      />

      {menu ? createPortal(menu, document.body) : null}
    </div>
  );
}
