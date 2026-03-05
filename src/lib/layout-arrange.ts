import type { LayoutComponent } from "@/src/lib/layout-model";

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

export function resolveComponentArrangeOrder(
  component: LayoutComponent,
  fallbackIndex: number
): number {
  const ddrArrangeOrder = toFiniteNumber(component.props.ddrArrangeOrder);
  if (ddrArrangeOrder != null) {
    return ddrArrangeOrder;
  }
  return fallbackIndex + 1;
}

export function sortComponentsByArrangeOrder(components: LayoutComponent[]): LayoutComponent[] {
  const fallbackIndexById = new Map<string, number>();
  components.forEach((component, index) => {
    fallbackIndexById.set(component.id, index);
  });

  return [...components].sort((left, right) => {
    const zDelta = left.position.z - right.position.z;
    if (zDelta !== 0) {
      return zDelta;
    }

    const leftFallback = fallbackIndexById.get(left.id) ?? 0;
    const rightFallback = fallbackIndexById.get(right.id) ?? 0;
    const leftArrangeOrder = resolveComponentArrangeOrder(left, leftFallback);
    const rightArrangeOrder = resolveComponentArrangeOrder(right, rightFallback);
    if (leftArrangeOrder !== rightArrangeOrder) {
      return leftArrangeOrder - rightArrangeOrder;
    }

    if (leftFallback !== rightFallback) {
      return leftFallback - rightFallback;
    }

    return left.id.localeCompare(right.id);
  });
}
