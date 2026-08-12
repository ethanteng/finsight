"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { PRIMARY_NAV_LINKS } from "@/lib/site-nav";

export function MarketingMobileMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const menuId = useId();
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setIsOpen(false);
      buttonRef.current?.focus();
    };

    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("keydown", closeOnEscape);
    document.addEventListener("pointerdown", closeOnOutsideClick);

    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("pointerdown", closeOnOutsideClick);
    };
  }, [isOpen]);

  const closeMenu = () => setIsOpen(false);

  return (
    <div className="mobile-nav" ref={menuRef}>
      <button
        ref={buttonRef}
        className="mobile-menu-button"
        type="button"
        aria-label={isOpen ? "Close menu" : "Open menu"}
        aria-controls={menuId}
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
      >
        {isOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
      </button>

      {isOpen && (
        <div className="mobile-menu-panel" id={menuId} aria-label="Mobile navigation">
          {PRIMARY_NAV_LINKS.map((item) => (
            <Link className="mobile-menu-link" href={item.href} key={item.href} onClick={closeMenu}>
              {item.label}
              <span aria-hidden="true">→</span>
            </Link>
          ))}
          <Link
            aria-label="Sign in to Ask Linc"
            className="mobile-menu-link mobile-menu-sign-in"
            href="/login"
            onClick={closeMenu}
          >
            Sign in
            <span aria-hidden="true">→</span>
          </Link>
        </div>
      )}
    </div>
  );
}
