export function logEvent(event: string, fields: Record<string, string | number | boolean | null>) {
  console.log(JSON.stringify({ event, at: new Date().toISOString(), ...fields }));
}
