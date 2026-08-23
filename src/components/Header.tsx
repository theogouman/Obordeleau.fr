"use client";

import NextLink from "next/link";
import { useLocale } from "next-intl";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import { getPathname, Link, usePathname } from "@/i18n/navigation";
import { LanguageMenu } from "@/components/LanguageMenu";
import { Wordmark } from "@/components/Wordmark";
import type { Locale } from "@/i18n/routing";

export type HeaderLabels = {
  home: string;
  gallery: string;
  amenities: string;
  around: string;
  about: string;
  reviews: string;
  location: string;
  book: string;
  openMenu: string;
  closeMenu: string;
  language: string;
  languageSwitch: string;
  primary: string;
  mobileMenu: string;
};

type Props = {
  labels: HeaderLabels;
};

/**
 * The same five sections wherever the visitor is. On the home page they are
 * anchors into the page; elsewhere they are client navigations to the home
 * page carrying the anchor, which Next then scrolls to.
 *
 * Declared here rather than inside Header: a component built during a render
 * is a new type on every render, and React would tear the whole nav down and
 * build it again each time the menu opened.
 */
function SectionLink({
  hash,
  className,
  children,
  atHome,
  home,
  onNavigate,
}: {
  hash: string;
  className: string;
  children: ReactNode;
  atHome: boolean;
  home: string;
  onNavigate: () => void;
}) {
  if (atHome) {
    return (
      <a href={hash} onClick={onNavigate} className={className}>
        {children}
      </a>
    );
  }

  return (
    <NextLink
      href={`${home}${hash}`}
      onClick={onNavigate}
      className={className}
    >
      {children}
    </NextLink>
  );
}

/**
 * Closed, open, and the moment in between.
 *
 * A menu that only knows open from closed can be shown and hidden but not
 * closed: the entries have to leave before the height does, and that takes a
 * state of its own.
 */
type MenuState = "closed" | "open" | "closing";

/** The reference animation, kept to the millisecond: entries out, then height. */
const COLLAPSE_DELAY_MS = 120;
const CLOSE_MS = 420;

export function Header({ labels }: Props) {
  const [menu, setMenu] = useState<MenuState>("closed");
  const panelRef = useRef<HTMLDivElement>(null);
  const open = menu !== "closed";
  const pathname = usePathname();
  const locale = useLocale() as Locale;

  // On the home page the nav scrolls to sections, elsewhere it links back.
  // Read from the route rather than passed down, now that the header is
  // mounted once by the layout instead of once by each page.
  const variant = pathname === "/" ? "home" : "inner";

  // The header no longer unmounts between pages, so the open menu has to be
  // closed by hand when a link inside it lands somewhere else.
  const closeMenu = useCallback(() => {
    setMenu((state) => (state === "open" ? "closing" : state));
  }, []);

  useEffect(() => {
    setMenu("closed");
  }, [pathname]);

  /*
   * The panel opens onto a measured height, because `auto` is not a number and
   * nothing tweens towards it. Reading `offsetHeight` between the two writes
   * forces the nought to be committed, so the browser has a first value to
   * travel from; without it both writes land in the same frame and the panel
   * simply appears at its full height, which is what it used to do.
   */
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;

    if (menu === "open") {
      panel.style.maxHeight = "0px";
      void panel.offsetHeight;
      panel.style.maxHeight = `${panel.scrollHeight}px`;
      return;
    }

    if (menu === "closing") {
      panel.style.maxHeight = `${panel.scrollHeight}px`;
      const collapse = window.setTimeout(() => {
        panel.style.maxHeight = "0px";
      }, COLLAPSE_DELAY_MS);
      const settle = window.setTimeout(() => setMenu("closed"), CLOSE_MS);
      return () => {
        window.clearTimeout(collapse);
        window.clearTimeout(settle);
      };
    }

    panel.style.maxHeight = "";
  }, [menu]);

  // The page underneath does not scroll while the panel is over it.
  useEffect(() => {
    if (menu !== "open") return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [menu]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMenu();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [closeMenu, open]);

  const sections = [
    { hash: "#gallery", label: labels.gallery },
    { hash: "#amenities", label: labels.amenities },
    { hash: "#around", label: labels.around },
    { hash: "#reviews", label: labels.reviews },
    { hash: "#location", label: labels.location },
  ];

  // The localized home page, so a section of it can be reached from anywhere.
  const home = getPathname({ href: "/", locale });

  // The three props every section link shares.
  const shared = { atHome: variant === "home", home, onNavigate: closeMenu };

  /**
   * The page is already loaded, so going back to the top is a scroll and not a
   * navigation. Without this the browser reloads the document, which is the
   * jump the owner saw.
   */
  function toTop(event: MouseEvent<HTMLAnchorElement>) {
    if (variant !== "home") return;
    event.preventDefault();
    closeMenu();
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
  }

  return (
    <>
      {/*
       * Outside the header, deliberately. The header carries a backdrop blur,
       * and a blurred box becomes the containing block of anything fixed
       * inside it: the veil was being held to the height of the bar instead of
       * covering the page, and it painted over the panel rather than under it.
       */}
      <div
        className="menu-scrim lg:hidden"
        data-state={menu}
        aria-hidden="true"
        onClick={closeMenu}
      />

      <header className="sticky top-0 z-40 border-b border-[rgba(58,42,38,0.08)] bg-[rgba(250,247,242,0.92)] backdrop-blur">
        <div className="container-page flex items-center justify-between gap-4 py-3">
          {/* An anchor either way, so it still works with no JavaScript. */}
          {variant === "home" ? (
            <a
              href={home}
              onClick={toTop}
              className="text-ink"
              aria-label={labels.home}
            >
              <Wordmark />
            </a>
          ) : (
            <Link href="/" className="text-ink" aria-label={labels.home}>
              <Wordmark />
            </Link>
          )}

          <nav
            aria-label={labels.primary}
            className="hidden items-center gap-6 text-sm lg:flex"
          >
            {sections.map((item) => (
              <SectionLink
                key={item.hash}
                {...shared}
                hash={item.hash}
                className="text-ink-soft transition-colors hover:text-ink"
              >
                {item.label}
              </SectionLink>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <LanguageMenu
              label={labels.language}
              switchLabel={labels.languageSwitch}
              className="hidden sm:block"
            />
            <SectionLink
              {...shared}
              hash="#book"
              className="btn btn-primary hidden px-4 py-2 text-sm sm:inline-flex"
            >
              {labels.book}
            </SectionLink>

            <button
              type="button"
              onClick={() => (menu === "open" ? closeMenu() : setMenu("open"))}
              aria-expanded={menu === "open"}
              aria-controls="mobile-menu"
              data-state={menu}
              className="menu-toggle lg:hidden"
            >
              <span className="visually-hidden">
                {open ? labels.closeMenu : labels.openMenu}
              </span>
              <span className="menu-bar menu-bar--top" aria-hidden="true" />
              <span className="menu-bar menu-bar--middle" aria-hidden="true" />
              <span className="menu-bar menu-bar--bottom" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div
          id="mobile-menu"
          ref={panelRef}
          hidden={menu === "closed"}
          data-state={menu}
          className="menu-panel relative z-10 border-t border-[rgba(58,42,38,0.08)] bg-cream lg:hidden"
        >
          <nav
            aria-label={labels.mobileMenu}
            className="container-page flex flex-col gap-1 py-4"
          >
            {sections.map((item) => (
              <SectionLink
                key={item.hash}
                {...shared}
                hash={item.hash}
                className="menu-item rounded-[var(--radius-card)] px-2 py-3 text-ink-soft hover:bg-sand hover:text-ink"
              >
                {item.label}
              </SectionLink>
            ))}

            <div className="menu-item mt-2 flex items-center justify-between gap-3 border-t border-[rgba(58,42,38,0.08)] pt-4">
              <LanguageMenu
                label={labels.language}
                switchLabel={labels.languageSwitch}
                align="start"
              />
              <SectionLink
                {...shared}
                hash="#book"
                className="btn btn-primary px-4 py-2 text-sm"
              >
                {labels.book}
              </SectionLink>
            </div>
          </nav>
        </div>
      </header>
    </>
  );
}
