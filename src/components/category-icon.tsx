import { createElement } from "react";
import {
  ArrowLeftRight, Banknote, Briefcase, CalendarClock, Car, CarFront, Circle, CircleDot, CircleHelp,
  CreditCard, Dumbbell, Fuel, Gamepad2, Gift, GraduationCap, HandCoins, HeartPulse, House, Landmark,
  Package, Percent, PiggyBank, Pill, Plane, PlusCircle, Repeat, Scissors, ShieldCheck, Shirt,
  Scale, ShoppingBag, ShoppingBasket, Smartphone, Sofa, SprayCan, SquareParking, Utensils, Wrench,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

/** Explicit map keeps the bundle small (no "import every icon"). Keys = names stored in categories.icon. */
const ICONS: Record<string, LucideIcon> = {
  "arrow-left-right": ArrowLeftRight, banknote: Banknote, briefcase: Briefcase, "calendar-clock": CalendarClock,
  car: Car, "car-front": CarFront, circle: Circle, "circle-dot": CircleDot, "circle-help": CircleHelp,
  "credit-card": CreditCard, dumbbell: Dumbbell, fuel: Fuel, "gamepad-2": Gamepad2, gift: Gift,
  "graduation-cap": GraduationCap, "hand-coins": HandCoins, "heart-pulse": HeartPulse, house: House,
  landmark: Landmark, package: Package, percent: Percent, "piggy-bank": PiggyBank, pill: Pill, plane: Plane,
  "plus-circle": PlusCircle, repeat: Repeat, scale: Scale, scissors: Scissors, "shield-check": ShieldCheck, shirt: Shirt,
  "shopping-bag": ShoppingBag, "shopping-basket": ShoppingBasket, smartphone: Smartphone, sofa: Sofa,
  "spray-can": SprayCan, "square-parking": SquareParking, utensils: Utensils, wrench: Wrench,
};

export function iconFor(name: string | null | undefined): LucideIcon {
  return (name && ICONS[name]) || CircleDot;
}

/** Colored icon chip (§9): tinted background + category color icon. */
export function CategoryChip({
  icon,
  color,
  size = "md",
  dashed,
  className,
}: {
  icon: string | null | undefined;
  color: string | null | undefined;
  size?: "sm" | "md";
  dashed?: boolean;
  className?: string;
}) {
  const c = color ?? "#718096";
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center rounded-xl",
        size === "md" ? "size-10" : "size-8",
        dashed && "border border-dashed",
        className,
      )}
      style={dashed ? { borderColor: `${c}66` } : { background: `${c}22` }}
    >
      {createElement(iconFor(icon), { className: size === "md" ? "size-[18px]" : "size-4", style: { color: c } })}
    </span>
  );
}
