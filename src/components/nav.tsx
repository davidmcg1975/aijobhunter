"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/jobs", label: "Jobs" },
  { href: "/saved", label: "Saved jobs" },
  { href: "/applications", label: "Applications" },
  { href: "/profile", label: "My profile" },
  { href: "/cv", label: "My CV" },
  { href: "/settings", label: "Settings" },
];

export function Nav({ name, isAdmin }: { name: string; isAdmin: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const links = isAdmin ? [...LINKS, { href: "/admin", label: "Admin" }] : LINKS;

  return (
    <header
      style={{
        background: "var(--surface)",
        borderBottom: "1px solid var(--border)",
        position: "sticky",
        top: 0,
        zIndex: 20,
      }}
    >
      <div
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          padding: "0.7rem 1rem",
          display: "flex",
          alignItems: "center",
          gap: "1rem",
        }}
      >
        <Link
          href="/dashboard"
          style={{
            fontWeight: 700,
            textDecoration: "none",
            letterSpacing: "-0.02em",
            whiteSpace: "nowrap",
          }}
        >
          AI Contract Hunter
        </Link>

        <nav className="desktop-nav" style={{ display: "flex", gap: "0.15rem", flex: 1 }}>
          {links.map((link) => {
            const active =
              pathname === link.href || pathname.startsWith(`${link.href}/`);
            return (
              <Link
                key={link.href}
                href={link.href}
                style={{
                  padding: "0.4rem 0.7rem",
                  borderRadius: 7,
                  fontSize: "0.88rem",
                  fontWeight: active ? 620 : 500,
                  textDecoration: "none",
                  color: active ? "var(--accent)" : "var(--text-muted)",
                  background: active ? "var(--accent-soft)" : "transparent",
                }}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div
          className="desktop-nav"
          style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}
        >
          <span className="subtle" style={{ fontSize: "0.85rem" }}>
            {name}
          </span>
          <form action="/api/auth/logout" method="post">
            <button type="submit" className="btn btn-sm">
              Log out
            </button>
          </form>
        </div>

        <button
          type="button"
          className="btn btn-sm mobile-toggle"
          aria-expanded={open}
          aria-label="Toggle navigation"
          onClick={() => setOpen((value) => !value)}
          style={{ display: "none", marginLeft: "auto" }}
        >
          {open ? "Close" : "Menu"}
        </button>
      </div>

      {open && (
        <div
          className="mobile-menu"
          style={{
            borderTop: "1px solid var(--border)",
            padding: "0.5rem 1rem 0.9rem",
          }}
        >
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              style={{
                display: "block",
                padding: "0.6rem 0.4rem",
                textDecoration: "none",
                fontWeight: 550,
                borderBottom: "1px solid var(--border)",
              }}
            >
              {link.label}
            </Link>
          ))}
          <form action="/api/auth/logout" method="post" style={{ marginTop: "0.8rem" }}>
            <button type="submit" className="btn btn-sm">
              Log out
            </button>
          </form>
        </div>
      )}

      <style>{`
        @media (max-width: 900px) {
          .desktop-nav { display: none !important; }
          .mobile-toggle { display: inline-flex !important; }
        }
        @media (min-width: 901px) {
          .mobile-menu { display: none; }
        }
      `}</style>
    </header>
  );
}
