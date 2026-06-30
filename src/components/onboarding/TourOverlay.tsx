import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { useTour } from "@/components/onboarding/TourProvider";

type Rect = { top: number; left: number; width: number; height: number };

const CARD_WIDTH = 340;
const SPOTLIGHT_PAD = 8;
const GAP = 14; // space between spotlight and card

function findTarget(name: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-tour="${name}"]`);
}

// Pick where the card sits relative to the target, clamped into the viewport.
function placeCard(
  rect: Rect,
  placement: "top" | "bottom" | "left" | "right",
  cardHeight: number,
): { top: number; left: number; arrow: "top" | "bottom" | "left" | "right" } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let top = 0;
  let left = 0;
  let arrow: "top" | "bottom" | "left" | "right" = placement;

  switch (placement) {
    case "top":
      top = rect.top - cardHeight - GAP;
      left = rect.left + rect.width / 2 - CARD_WIDTH / 2;
      arrow = "bottom";
      break;
    case "bottom":
      top = rect.top + rect.height + GAP;
      left = rect.left + rect.width / 2 - CARD_WIDTH / 2;
      arrow = "top";
      break;
    case "left":
      top = rect.top + rect.height / 2 - cardHeight / 2;
      left = rect.left - CARD_WIDTH - GAP;
      arrow = "right";
      break;
    case "right":
    default:
      top = rect.top + rect.height / 2 - cardHeight / 2;
      left = rect.left + rect.width + GAP;
      arrow = "left";
      break;
  }

  // Flip vertical placements if they'd go off-screen.
  if (top < 8 && (arrow === "bottom" || arrow === "top")) {
    top = rect.top + rect.height + GAP;
    arrow = "top";
  }
  if (top + cardHeight > vh - 8 && arrow === "top") {
    top = rect.top - cardHeight - GAP;
    arrow = "bottom";
  }

  left = Math.max(8, Math.min(left, vw - CARD_WIDTH - 8));
  top = Math.max(8, Math.min(top, vh - cardHeight - 8));
  return { top, left, arrow };
}

export function TourOverlay() {
  const { active, step, index, total, next, back, stop } = useTour();
  const [rect, setRect] = useState<Rect | null>(null);
  const [cardHeight, setCardHeight] = useState(180);
  const cardRef = useRef<HTMLDivElement | null>(null);

  // Locate + track the spotlight target. Polls briefly because a cross-page step
  // navigates first, and the target may mount a moment later.
  useLayoutEffect(() => {
    if (!active || !step) return;
    if (!step.target) {
      setRect(null);
      return;
    }
    let frame = 0;
    let tries = 0;
    const measure = () => {
      const el = findTarget(step.target!);
      if (el) {
        const r = el.getBoundingClientRect();
        el.scrollIntoView({ block: "center", behavior: "smooth" });
        setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
        return true;
      }
      return false;
    };
    const tick = () => {
      if (measure() || tries > 40) return;
      tries += 1;
      frame = window.setTimeout(tick, 50);
    };
    tick();
    const onMove = () => measure();
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    return () => {
      window.clearTimeout(frame);
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
    };
  }, [active, step]);

  useLayoutEffect(() => {
    if (cardRef.current) setCardHeight(cardRef.current.offsetHeight);
  }, [step, rect]);

  // Escape quits the tour.
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") stop(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, stop]);

  if (!active || !step) return null;

  const isLast = index === total - 1;
  const centered = !step.target || !rect;

  const spot = rect
    ? {
        top: rect.top - SPOTLIGHT_PAD,
        left: rect.left - SPOTLIGHT_PAD,
        width: rect.width + SPOTLIGHT_PAD * 2,
        height: rect.height + SPOTLIGHT_PAD * 2,
      }
    : null;

  const placed =
    rect && step.placement
      ? placeCard(rect, step.placement, cardHeight)
      : rect
        ? placeCard(rect, "bottom", cardHeight)
        : null;

  const card = (
    <div
      ref={cardRef}
      role="dialog"
      aria-modal="true"
      aria-label="Getting started tour"
      className="pointer-events-auto fixed z-[101] w-[340px] rounded-lg border bg-popover p-4 text-popover-foreground shadow-xl"
      style={
        centered
          ? { top: "50%", left: "50%", transform: "translate(-50%, -50%)" }
          : { top: placed!.top, left: placed!.left }
      }
    >
      {!centered && placed ? <Arrow side={placed.arrow} /> : null}
      <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Step {index + 1} of {total}
      </div>
      <h3 className="text-base font-semibold">{step.title}</h3>
      <p className="mt-1.5 text-sm text-muted-foreground">{step.body}</p>
      <div className="mt-3 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => stop(true)}
          className="text-xs text-muted-foreground underline-offset-2 hover:underline"
        >
          Skip tour
        </button>
        <div className="flex gap-2">
          {index > 0 ? (
            <Button variant="outline" size="sm" onClick={back}>
              Back
            </Button>
          ) : null}
          <Button size="sm" onClick={next}>
            {isLast ? "Finish" : "Next"}
          </Button>
        </div>
      </div>
      <div className="mt-3 flex gap-1">
        {Array.from({ length: total }).map((_, i) => (
          <span
            key={i}
            className={`h-1 flex-1 rounded-full ${i <= index ? "bg-primary" : "bg-muted"}`}
          />
        ))}
      </div>
    </div>
  );

  return createPortal(
    <div className="fixed inset-0 z-[100]">
      {centered ? (
        // No target: a single dim backdrop. Clicking it does nothing (avoids
        // accidental dismissal); use Skip/Next.
        <div className="absolute inset-0 bg-black/60" />
      ) : (
        // Four panels dim everything EXCEPT the target, which stays visible and
        // clickable through the hole.
        <>
          <div
            className="absolute bg-black/55"
            style={{ top: 0, left: 0, right: 0, height: Math.max(0, spot!.top) }}
          />
          <div
            className="absolute bg-black/55"
            style={{
              top: spot!.top,
              left: 0,
              width: Math.max(0, spot!.left),
              height: spot!.height,
            }}
          />
          <div
            className="absolute bg-black/55"
            style={{
              top: spot!.top,
              left: spot!.left + spot!.width,
              right: 0,
              height: spot!.height,
            }}
          />
          <div
            className="absolute bg-black/55"
            style={{ top: spot!.top + spot!.height, left: 0, right: 0, bottom: 0 }}
          />
          <div
            className="absolute rounded-lg ring-2 ring-primary"
            style={{
              top: spot!.top,
              left: spot!.left,
              width: spot!.width,
              height: spot!.height,
              boxShadow: "0 0 0 2px rgba(255,255,255,0.4)",
              pointerEvents: "none",
            }}
          />
        </>
      )}
      {card}
    </div>,
    document.body,
  );
}

function Arrow({ side }: { side: "top" | "bottom" | "left" | "right" }) {
  const base = "absolute h-3 w-3 rotate-45 border bg-popover";
  const pos: Record<typeof side, string> = {
    top: "left-1/2 -top-1.5 -translate-x-1/2 border-b-0 border-r-0",
    bottom: "left-1/2 -bottom-1.5 -translate-x-1/2 border-t-0 border-l-0",
    left: "top-1/2 -left-1.5 -translate-y-1/2 border-t-0 border-r-0",
    right: "top-1/2 -right-1.5 -translate-y-1/2 border-b-0 border-l-0",
  };
  return <div className={`${base} ${pos[side]}`} />;
}
