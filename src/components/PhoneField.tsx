'use client';

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
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
  const [closing, setClosing] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  const fieldRef = useRef<HTMLDivElement>(null);
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

  function close(giveFocusBack: boolean) {
    if (!open) return;
    setClosing(true);
    setOpen(false);
    window.setTimeout(() => setClosing(false), 200);
    setQuery('');
    if (giveFocusBack) numberRef.current?.focus();
  }

  function choose(option: DialOption) {
    onCountryChange(option.country);
    close(true);
  }

  // Clicking anywhere else, or pressing Escape, puts the menu away.
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!fieldRef.current?.contains(event.target as Node)) close(false);
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
  }, [open]);

  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

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

  return (
    <div
      ref={fieldRef}
      className={`phone-field ${open ? 'is-open' : ''} ${invalid ? 'is-error' : ''}`}
    >
      <button
        type="button"
        className="phone-country"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={`${labels.choose}${selected ? `, ${selected.name}` : ''}`}
        onClick={() => (open ? close(true) : setOpen(true))}
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

      {open || closing ? (
        <div
          id={menuId}
          role="listbox"
          aria-label={labels.choose}
          className={`phone-menu t-dropdown ${open ? 'is-open' : 'is-closing'}`}
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
      ) : null}
    </div>
  );
}
