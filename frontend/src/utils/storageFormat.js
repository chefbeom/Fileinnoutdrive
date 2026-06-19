import { DISPLAY_UNITS } from "@/constants/adminDashboardOptions.js";

export const formatBytesAuto = (bytes) => {
  const size = Number(bytes || 0);
  if (!Number.isFinite(size) || size <= 0) {
    return "0 B";
  }

  const unitIndex = Math.min(Math.floor(Math.log(size) / Math.log(1024)), DISPLAY_UNITS.length - 1);
  const unit = DISPLAY_UNITS[unitIndex];
  const value = size / unit.bytes;
  const fractionDigits = unit.value === "B" ? 0 : value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(fractionDigits)} ${unit.label}`;
};

export const formatBytesByUnit = (bytes, unit = "GB") => {
  const selectedUnit = DISPLAY_UNITS.find((item) => item.value === unit) || DISPLAY_UNITS[3];
  const size = Number(bytes || 0);
  if (!Number.isFinite(size)) {
    return `0 ${selectedUnit.label}`;
  }

  const value = size / selectedUnit.bytes;
  const fractionDigits = selectedUnit.value === "B" ? 0 : value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(fractionDigits)} ${selectedUnit.label}`;
};

export const percentValue = (numerator, denominator) => {
  const safeDenominator = Number(denominator || 0);
  if (!Number.isFinite(safeDenominator) || safeDenominator <= 0) {
    return 0;
  }

  const safeNumerator = Number(numerator || 0);
  return Math.round((safeNumerator * 10000) / safeDenominator) / 100;
};

export const formatPercent = (value) => `${Number(value || 0).toFixed(2)}%`;

export const clampPercent = (value) => {
  const numericValue = Number(value || 0);
  if (!Number.isFinite(numericValue)) {
    return 0;
  }

  return Math.min(100, Math.max(0, numericValue));
};

export const buildRingStyle = (percent, color) => {
  const clampedPercent = clampPercent(percent);
  return {
    background: `conic-gradient(${color} 0 ${clampedPercent}%, var(--bg-input) ${clampedPercent}% 100%)`,
  };
};

export const bytesToDisplayUnitInput = (bytes, fallbackValue = "50", fallbackUnit = "TB") => {
  const size = Number(bytes || 0);
  if (!Number.isFinite(size) || size <= 0) {
    return { value: fallbackValue, unit: fallbackUnit };
  }

  const preferredUnit = DISPLAY_UNITS.slice().reverse().find((unitOption) => size >= unitOption.bytes) || DISPLAY_UNITS[0];
  return {
    value: String(Number((size / preferredUnit.bytes).toFixed(preferredUnit.value === "B" ? 0 : 2))),
    unit: preferredUnit.value,
  };
};
