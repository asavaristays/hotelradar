"use client";

import { useEffect } from "react";
import Link from "next/link";
import { BOOKING_HOW_SHORT } from "../../lib/content";
import { IconClose } from "../../lib/icons";

type Props = {
  open: boolean;
  onClose: () => void;
};

export function BookingHowModal({ open, onClose }: Props) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="booking-modal-root" role="presentation">
      <button
        type="button"
        className="booking-modal-backdrop"
        aria-label="Close"
        onClick={onClose}
      />
      <div
        className="booking-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="booking-how-title"
      >
        <div className="booking-modal-head">
          <h2 id="booking-how-title">How booking works</h2>
          <button
            type="button"
            className="booking-modal-close"
            aria-label="Close"
            onClick={onClose}
          >
            <IconClose />
          </button>
        </div>

        <ol className="booking-modal-steps">
          {BOOKING_HOW_SHORT.map((item) => (
            <li key={item.step}>
              <span className="booking-step-num" aria-hidden>
                {item.step}
              </span>
              <span>{item.line}</span>
            </li>
          ))}
        </ol>

        <p className="booking-modal-more">
          <Link href="/how-booking-works" onClick={onClose}>
            Read the full version
          </Link>
        </p>
      </div>
    </div>
  );
}
