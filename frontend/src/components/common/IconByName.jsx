import {
  ArrowLeftRight, BookOpen, Boxes, Car, CircleDollarSign, ClipboardList, Cog, Container, Eye, Factory,
  FileText, Flag, Gauge, Globe, Handshake, HardHat, Headset, CircleHelp, Layers, Map, MessageSquare,
  Network, Package, PackageCheck, Route, Scale, ShieldCheck, ShoppingBag, Snowflake, Truck, Users,
  Utensils, Wheat, Zap, Warehouse,
} from 'lucide-react';

// Central icon registry so content/config data can reference icons by plain string (CMS friendly).
const ICONS = {
  truck: Truck, boxes: Boxes, container: Container, snowflake: Snowflake, layers: Layers, zap: Zap,
  package: Package, globe: Globe, shield: ShieldCheck, map: Map, headset: Headset, network: Network,
  clipboard: ClipboardList, message: MessageSquare, route: Route, users: Users, flag: Flag, eye: Eye,
  factory: Factory, hardhat: HardHat, car: Car, bag: ShoppingBag, utensils: Utensils, wheat: Wheat,
  cog: Cog, scale: Scale, gauge: Gauge, handshake: Handshake, file: FileText, dollar: CircleDollarSign,
  check: PackageCheck, help: CircleHelp, book: BookOpen, swap: ArrowLeftRight, warehouse: Warehouse,
};

export const ICON_NAMES = Object.keys(ICONS);

export default function IconByName({ name, className = 'size-6', ...rest }) {
  const Icon = ICONS[name] || Package;
  return <Icon className={className} aria-hidden="true" {...rest} />;
}
