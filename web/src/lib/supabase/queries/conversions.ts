export function celsiusToFahrenheit(celsius: number): number {
  return (celsius * 9) / 5 + 32;
}

export function celsiusDeltaToFahrenheit(celsiusDelta: number): number {
  return (celsiusDelta * 9) / 5;
}
