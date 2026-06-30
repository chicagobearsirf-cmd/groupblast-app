import { brand } from "@/lib/brand";

// A single coachmark step. `target` is a `data-tour` attribute value on the real
// element to spotlight; omit it for a centered modal (welcome / finish). `route`
// is navigated to before the step shows, so the tour can span pages.
export type TourStep = {
  id: string;
  route: string;
  target?: string;
  title: string;
  body: string;
  placement?: "top" | "bottom" | "left" | "right";
};

// Ordered path a brand-new buddy follows: connect Facebook -> install the
// helper -> get groups in -> write a post -> run a safe one-group test -> learn
// the auto-submit + don't-touch-the-screen rules. Step numbers are shown by the
// overlay ("Step X of N"), so titles stay number-free to avoid renumber bugs.
export const TOUR_STEPS: TourStep[] = [
  {
    id: "welcome",
    route: "/",
    title: `Welcome to ${brand.name}`,
    body: "This quick tour gets you from a fresh login all the way to your first post. You can quit anytime and restart it from the “Getting started” button in the top bar.",
  },
  {
    id: "launch-browser",
    route: "/",
    target: "launch-fb-browser",
    title: "Open your Facebook browser",
    body: "Click this to open the app's own browser window and log into Facebook there. Being logged in on your normal Chrome does NOT count — the app drives this separate window.",
    placement: "top",
  },
  {
    id: "check-login",
    route: "/",
    target: "check-fb-login",
    title: "Confirm you're logged in",
    body: "After you log into Facebook in that window, click here. It should report that your session is active. Green light = you're ready to post.",
    placement: "top",
  },
  {
    id: "extension",
    route: "/",
    target: "nav-extension",
    title: "Install the browser helper",
    body: "Open the Extension page to download our 1-click Chrome helper — it grabs the groups you're already in so you don't paste links by hand. The page has the download button and step-by-step install, plus a help link if you get stuck.",
    placement: "right",
  },
  {
    id: "import",
    route: "/",
    target: "nav-import",
    title: "Get your groups in",
    body: "Open Import to add the Facebook groups you want to post to — paste links, or pull in everything the browser helper captured.",
    placement: "right",
  },
  {
    id: "groups",
    route: "/groups",
    target: "nav-groups",
    title: "Your group library",
    body: "Every group you import lives here. You can sort them into categories so you can target the right ones later. This is your reusable list.",
    placement: "right",
  },
  {
    id: "compose",
    route: "/compose",
    target: "compose-textarea",
    title: "Write your post",
    body: "Paste the exact post you want to publish here. What you type is what gets posted — no edits happen behind your back.",
    placement: "bottom",
  },
  {
    id: "pick-groups",
    route: "/compose",
    target: "compose-test-one",
    title: "Start with ONE group",
    body: "Always test with a single group first. This button selects just one so you can confirm everything works before posting to many.",
    placement: "top",
  },
  {
    id: "create-queue",
    route: "/compose",
    target: "compose-create-queue",
    title: "Build the queue",
    body: "This turns your post + selected groups into a queue. Next you'll run it from the Queue page and watch the result.",
    placement: "top",
  },
  {
    id: "queue",
    route: "/compose",
    target: "nav-queue",
    title: "Run and watch",
    body: "The Queue page is where you press Start and watch each group post in turn. Your History page keeps a record of every result.",
    placement: "right",
  },
  {
    id: "dont-touch",
    route: "/compose",
    title: "⚠️ While it's posting — hands off",
    body: "When a run is going, the app opens its OWN browser window and types/clicks for you. Don't touch that window, your mouse, or your keyboard near it — and don't close it. It may flip between screens on its own; that's normal. Touching it can stop the post mid-way. A yellow bar at the bottom of the app shows when it's working — just wait for it to clear.",
  },
  {
    id: "settings",
    route: "/compose",
    target: "nav-settings",
    title: "The auto-submit switch",
    body: "In Settings you choose Auto-submit (the app clicks Post for you) or Human review (it fills the box and waits for you). Keep the delays on to stay safe with Facebook.",
    placement: "right",
  },
  {
    id: "finish",
    route: "/",
    title: "You're set 🎉",
    body: "That's the whole loop: log in → install helper → import → write → test one group → run (hands off while it works). Reopen this tour anytime from “Getting started” in the top bar. Go run a one-group test.",
  },
];
