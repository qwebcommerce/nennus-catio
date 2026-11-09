import {
  BriefcaseBusiness,
  CalendarDays,
  Car,
  Coffee,
  Dumbbell,
  ForkKnife,
  Hotel,
  Package,
  PawPrint,
  Pill,
  Scissors,
  Shirt,
  ShoppingBag,
  ShoppingCart,
  Smartphone,
  Wrench,
} from "lucide-react";

const ICON_BY_VERTICAL = {
  GROCERY: ShoppingCart,
  RESTAURANT: ForkKnife,
  CAFE: Coffee,
  PHONE_STORE: Smartphone,
  AUTO_DEALER: Car,
  BOOKING_SERVICES: CalendarDays,
  RETAIL_GENERAL: ShoppingBag,
  PHARMACY: Pill,
  CLOTHING: Shirt,
  HARDWARE_ELECTRONICS: Wrench,
  BEAUTY_SALON: Scissors,
  PET_STORE: PawPrint,
  HOTEL: Hotel,
  FITNESS: Dumbbell,
  WHOLESALE: Package,
  SERVICES_OTHER: BriefcaseBusiness,
};

export function BusinessVerticalIcon({ id, size = 24, color = "#111" }) {
  const Icon = ICON_BY_VERTICAL[id] || BriefcaseBusiness;
  return <Icon size={size} strokeWidth={2} color={color} aria-hidden />;
}
