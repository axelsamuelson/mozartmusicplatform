export function tempoLabel(value: number): string {
  if (value <= 2) return "Very slow";
  if (value <= 4) return "Slow";
  if (value <= 6) return "Moderate";
  if (value <= 8) return "Fast";
  return "Very fast";
}

export function intensityLabel(value: number): string {
  if (value <= 2) return "Very calm";
  if (value <= 4) return "Calm";
  if (value <= 6) return "Moderate";
  if (value <= 8) return "Intense";
  return "Very intense";
}

export function scaleValueColorClass(value: number): string {
  if (value <= 3) return "text-blue-400";
  if (value <= 6) return "text-white";
  return "text-wam";
}

export type ComboDescriptor = {
  label: string;
  pillClass: string;
};

export function comboDescriptor(tempo: number, intensity: number): ComboDescriptor {
  if (tempo >= 5 && tempo <= 6 && intensity >= 4 && intensity <= 6) {
    return {
      label: "Balanced",
      pillClass: "border-white/20 bg-white/10 text-white/70",
    };
  }
  if (tempo <= 4 && intensity <= 4) {
    return {
      label: "Chill",
      pillClass: "border-blue-400/30 bg-blue-500/10 text-blue-300",
    };
  }
  if (tempo <= 4 && intensity >= 5) {
    return {
      label: "Dark & Heavy",
      pillClass: "border-purple-400/30 bg-purple-500/10 text-purple-300",
    };
  }
  if (tempo >= 5 && intensity <= 4) {
    return {
      label: "Light & Upbeat",
      pillClass: "border-emerald-400/30 bg-emerald-500/10 text-emerald-300",
    };
  }
  if (tempo >= 5 && intensity >= 5) {
    return {
      label: "High Energy",
      pillClass: "border-orange-400/35 bg-orange-500/15 text-orange-300",
    };
  }
  return {
    label: "Balanced",
    pillClass: "border-white/20 bg-white/10 text-white/70",
  };
}
