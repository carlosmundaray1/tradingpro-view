/**
 * Helpers para mostrar la zona horaria del browser en el chart, estilo
 * TradingView Pro ("UTC-5 Lima" abajo a la derecha, debajo de la escala).
 *
 * Usamos Intl.DateTimeFormat().resolvedOptions().timeZone para obtener el
 * IANA name del browser (ej: "America/Lima"), y getTimezoneOffset() para
 * el offset numérico con signo相对于 UTC.
 */

/** Devuelve el offset en minutos con signo; positivo = oeste de UTC.
 *  Ej: Lima (UTC-5) -> 300, Buenos Aires (UTC-3) -> 180, Tokio (UTC+9) -> -540. */
function tzOffsetMinutes(): number {
  return new Date().getTimezoneOffset();
}

/** Devuelve "UTC-5", "UTC+9", "UTC+0", "UTC-3" segun el offset del browser.
 *  Cero se muestra como "+0" (igual que TradingView). */
export function tzOffsetLabel(): string {
  const mins = tzOffsetMinutes();
  if (mins === 0) return "UTC+0";
  const sign = mins > 0 ? "-" : "+";
  const hours = Math.abs(Math.floor(Math.abs(mins) / 60));
  const minsRem = Math.abs(mins) % 60;
  if (minsRem === 0) return `UTC${sign}${hours}`;
  return `UTC${sign}${hours}:${minsRem.toString().padStart(2, "0")}`;
}

/** Map corto de IANA -> nombre ciudad amigable para el chip del chart.
 *  Si el IANA del browser no está en el map, deriva el último segmento. */
const CITY_BY_TZ: Record<string, string> = {
  "America/Lima": "Lima",
  "America/Bogota": "Bogota",
  "America/Caracas": "Caracas",
  "America/Argentina/Buenos_Aires": "Buenos Aires",
  "America/Argentina/Mendoza": "Mendoza",
  "America/Mexico_City": "Mexico",
  "America/Merida": "Merida",
  "America/Monterrey": "Monterrey",
  "America/New_York": "New York",
  "America/Chicago": "Chicago",
  "America/Denver": "Denver",
  "America/Los_Angeles": "Los Angeles",
  "America/Sao_Paulo": "Sao Paulo",
  "America/Santiago": "Santiago",
  "America/Guayaquil": "Guayaquil",
  "America/La_Paz": "La Paz",
  "America/Havana": "Havana",
  "America/Toronto": "Toronto",
  "Europe/Madrid": "Madrid",
  "Europe/London": "London",
  "Europe/Berlin": "Berlin",
  "Europe/Paris": "Paris",
  "Europe/Rome": "Rome",
  "Asia/Tokyo": "Tokyo",
  "Asia/Shanghai": "Shanghai",
  "Asia/Hong_Kong": "Hong Kong",
  "Asia/Singapore": "Singapore",
  "Asia/Dubai": "Dubai",
  "Australia/Sydney": "Sydney",
  "Pacific/Auckland": "Auckland",
  "UTC": "UTC",
};

/** Devuelve el nombre de ciudad para el chip del chart. Si el IANA del
 *  browser no está mapeado, deriva el último segmento del IANA
 *  (ej: "America/Costa_Rica" -> "Costa Rica", reemplazando "_"). */
export function tzCityLabel(): string {
  let tz = "UTC";
  try {
    tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    tz = "UTC";
  }
  const mapped = CITY_BY_TZ[tz];
  if (mapped) return mapped;
  const last = tz.split("/").pop() ?? "UTC";
  return last.replace(/_/g, " ");
}

/** Devuelve la string completa "UTC-5 Lima". */
export function tzFullLabel(): string {
  return `${tzOffsetLabel()} ${tzCityLabel()}`;
}

// ───────────────────────────────────────────────────────────────────
//  Catálogo de zonas horarias seleccionables en el dropdown del chart.
//  Agrupadas por offset para que el usuario encuentre rápido su UTC.
//  Cada item lleva el IANA name ( Intl timeZone ) y una etiqueta ciudad
//  principal representativa (igual que TradingView Pro).
// ───────────────────────────────────────────────────────────────────

export interface TzOption {
  /** IANA timezone id (para Intl.DateTimeFormat). "UTC" es valido. */
  id: string;
  /** Etiqueta de ciudad principal visible en el dropdown. */
  city: string;
  /** Offset base en horas (sin signo DST) — sólo para agrupar. */
  offsetHours: number;
}

/** Lista ordenada por offset ascendente (de UTC-12 a UTC+14).
 *  IMPORTANTE: Algunos IANA ids (ej: Pacific/Baker) no están disponibles
 *  en Windows / ICU según la platform. Por eso el catálogo se FILTRA al
 *  cargar el módulo: descartamos los ids que Intl no pueda resolver.
 *  Si una entrada queda descartada y era la default de un usuario, cae
 *  al fallback "UTC" (que existe en todas las platforms). */
const RAW_TZ_CATALOG: TzOption[] = [
  // UTC-12 a UTC-8 (Pacífico)
  { id: "Pacific/Baker", city: "Baker Island", offsetHours: -12 },
  { id: "Pacific/Niue", city: "Niue", offsetHours: -11 },
  { id: "Pacific/Pago_Pago", city: "Pago Pago", offsetHours: -11 },
  { id: "Pacific/Honolulu", city: "Honolulu", offsetHours: -10 },
  { id: "Pacific/Tahiti", city: "Tahiti", offsetHours: -10 },
  { id: "America/Anchorage", city: "Anchorage", offsetHours: -9 },
  { id: "America/Juneau", city: "Juneau", offsetHours: -9 },
  { id: "Pacific/Gambier", city: "Gambier", offsetHours: -9 },
  // UTC-8
  { id: "America/Los_Angeles", city: "Los Angeles", offsetHours: -8 },
  { id: "America/Tijuana", city: "Tijuana", offsetHours: -8 },
  { id: "America/Vancouver", city: "Vancouver", offsetHours: -8 },
  { id: "America/Seattle", city: "Seattle", offsetHours: -8 },
  { id: "Pacific/Pitcairn", city: "Pitcairn", offsetHours: -8 },
  // UTC-7
  { id: "America/Denver", city: "Denver", offsetHours: -7 },
  { id: "America/Phoenix", city: "Phoenix", offsetHours: -7 },
  { id: "America/Mazatlan", city: "Mazatlan", offsetHours: -7 },
  { id: "America/Edmonton", city: "Edmonton", offsetHours: -7 },
  { id: "America/Boise", city: "Boise", offsetHours: -7 },
  // UTC-6
  { id: "America/Chicago", city: "Chicago", offsetHours: -6 },
  { id: "America/Mexico_City", city: "Mexico City", offsetHours: -6 },
  { id: "America/Winnipeg", city: "Winnipeg", offsetHours: -6 },
  { id: "America/Guatemala", city: "Guatemala", offsetHours: -6 },
  { id: "America/El_Salvador", city: "San Salvador", offsetHours: -6 },
  { id: "America/Managua", city: "Managua", offsetHours: -6 },
  { id: "America/Costa_Rica", city: "San Jose", offsetHours: -6 },
  { id: "America/Regina", city: "Regina", offsetHours: -6 },
  // UTC-5
  { id: "America/New_York", city: "New York", offsetHours: -5 },
  { id: "America/Toronto", city: "Toronto", offsetHours: -5 },
  { id: "America/Miami", city: "Miami", offsetHours: -5 },
  { id: "America/Lima", city: "Lima", offsetHours: -5 },
  { id: "America/Bogota", city: "Bogota", offsetHours: -5 },
  { id: "America/Jamaica", city: "Kingston", offsetHours: -5 },
  { id: "America/Panama", city: "Panama", offsetHours: -5 },
  { id: "America/Nassau", city: "Nassau", offsetHours: -5 },
  { id: "America/Indianapolis", city: "Indianapolis", offsetHours: -5 },
  // UTC-4
  { id: "America/Caracas", city: "Caracas", offsetHours: -4 },
  { id: "America/Santiago", city: "Santiago", offsetHours: -4 },
  { id: "America/La_Paz", city: "La Paz", offsetHours: -4 },
  { id: "America/Manaus", city: "Manaus", offsetHours: -4 },
  { id: "America/Havana", city: "Havana", offsetHours: -4 },
  { id: "America/Santo_Domingo", city: "Santo Domingo", offsetHours: -4 },
  { id: "America/Puerto_Rico", city: "San Juan", offsetHours: -4 },
  { id: "America/Barbados", city: "Barbados", offsetHours: -4 },
  { id: "America/Curacao", city: "Curacao", offsetHours: -4 },
  { id: "Atlantic/Bermuda", city: "Bermuda", offsetHours: -4 },
  // UTC-3
  { id: "America/Sao_Paulo", city: "Sao Paulo", offsetHours: -3 },
  { id: "America/Argentina/Buenos_Aires", city: "Buenos Aires", offsetHours: -3 },
  { id: "America/Argentina/Cordoba", city: "Cordoba", offsetHours: -3 },
  { id: "America/Argentina/Mendoza", city: "Mendoza", offsetHours: -3 },
  { id: "America/Godthab", city: "Nuuk", offsetHours: -2 },
  { id: "America/Montevideo", city: "Montevideo", offsetHours: -3 },
  { id: "America/Cayenne", city: "Cayenne", offsetHours: -3 },
  { id: "America/Paramaribo", city: "Paramaribo", offsetHours: -3 },
  { id: "America/Recife", city: "Recife", offsetHours: -3 },
  { id: "America/Fortaleza", city: "Fortaleza", offsetHours: -3 },
  { id: "America/Belem", city: "Belem", offsetHours: -3 },
  // UTC-2
  { id: "Atlantic/South_Georgia", city: "South Georgia", offsetHours: -2 },
  // UTC-1
  { id: "Atlantic/Azores", city: "Azores", offsetHours: -1 },
  { id: "Atlantic/Cape_Verde", city: "Cape Verde", offsetHours: -1 },
  // UTC+0
  { id: "UTC", city: "Mercado Bursatil", offsetHours: 0 },
  { id: "Europe/London", city: "London", offsetHours: 0 },
  { id: "Europe/Lisbon", city: "Lisbon", offsetHours: 0 },
  { id: "Atlantic/Reykjavik", city: "Reykjavik", offsetHours: 0 },
  { id: "Africa/Casablanca", city: "Casablanca", offsetHours: 0 },
  { id: "Africa/Monrovia", city: "Monrovia", offsetHours: 0 },
  { id: "Atlantic/Canary", city: "Canary Islands", offsetHours: 0 },
  // UTC+1
  { id: "Europe/Madrid", city: "Madrid", offsetHours: 1 },
  { id: "Europe/Paris", city: "Paris", offsetHours: 1 },
  { id: "Europe/Berlin", city: "Berlin", offsetHours: 1 },
  { id: "Europe/Rome", city: "Rome", offsetHours: 1 },
  { id: "Europe/Amsterdam", city: "Amsterdam", offsetHours: 1 },
  { id: "Europe/Brussels", city: "Brussels", offsetHours: 1 },
  { id: "Europe/Vienna", city: "Vienna", offsetHours: 1 },
  { id: "Europe/Zurich", city: "Zurich", offsetHours: 1 },
  { id: "Europe/Stockholm", city: "Stockholm", offsetHours: 1 },
  { id: "Europe/Oslo", city: "Oslo", offsetHours: 1 },
  { id: "Europe/Copenhagen", city: "Copenhagen", offsetHours: 1 },
  { id: "Europe/Dublin", city: "Dublin", offsetHours: 1 },
  { id: "Africa/Lagos", city: "Lagos", offsetHours: 1 },
  { id: "Africa/Algiers", city: "Algiers", offsetHours: 1 },
  { id: "Africa/Tunis", city: "Tunis", offsetHours: 1 },
  // UTC+2
  { id: "Africa/Cairo", city: "Cairo", offsetHours: 2 },
  { id: "Europe/Athens", city: "Athens", offsetHours: 2 },
  { id: "Europe/Helsinki", city: "Helsinki", offsetHours: 2 },
  { id: "Europe/Bucharest", city: "Bucharest", offsetHours: 2 },
  { id: "Asia/Jerusalem", city: "Jerusalem", offsetHours: 2 },
  { id: "Asia/Beirut", city: "Beirut", offsetHours: 2 },
  { id: "Asia/Damascus", city: "Damascus", offsetHours: 2 },
  { id: "Africa/Johannesburg", city: "Johannesburg", offsetHours: 2 },
  { id: "Africa/Harare", city: "Harare", offsetHours: 2 },
  { id: "Europe/Kiev", city: "Kyiv", offsetHours: 2 },
  { id: "Europe/Sofia", city: "Sofia", offsetHours: 2 },
  // UTC+3
  { id: "Europe/Moscow", city: "Moscow", offsetHours: 3 },
  { id: "Asia/Riyadh", city: "Riyadh", offsetHours: 3 },
  { id: "Asia/Tehran", city: "Tehran", offsetHours: 3 },
  { id: "Asia/Baghdad", city: "Baghdad", offsetHours: 3 },
  { id: "Asia/Kuwait", city: "Kuwait", offsetHours: 3 },
  { id: "Africa/Nairobi", city: "Nairobi", offsetHours: 3 },
  { id: "Africa/Addis_Ababa", city: "Addis Ababa", offsetHours: 3 },
  { id: "Africa/Khartoum", city: "Khartoum", offsetHours: 3 },
  { id: "Europe/Istanbul", city: "Istanbul", offsetHours: 3 },
  { id: "Europe/Minsk", city: "Minsk", offsetHours: 3 },
  // UTC+4
  { id: "Asia/Dubai", city: "Dubai", offsetHours: 4 },
  { id: "Asia/Muscat", city: "Muscat", offsetHours: 4 },
  { id: "Asia/Baku", city: "Baku", offsetHours: 4 },
  { id: "Asia/Tbilisi", city: "Tbilisi", offsetHours: 4 },
  { id: "Asia/Yerevan", city: "Yerevan", offsetHours: 4 },
  { id: "Indian/Mauritius", city: "Mauritius", offsetHours: 4 },
  { id: "Indian/Reunion", city: "Reunion", offsetHours: 4 },
  // UTC+5
  { id: "Asia/Karachi", city: "Karachi", offsetHours: 5 },
  { id: "Asia/Kolkata", city: "Mumbai", offsetHours: 5 },
  { id: "Asia/Calcutta", city: "Calcutta", offsetHours: 5 },
  { id: "Asia/Ashgabat", city: "Ashgabat", offsetHours: 5 },
  { id: "Asia/Tashkent", city: "Tashkent", offsetHours: 5 },
  { id: "Asia/Yekaterinburg", city: "Yekaterinburg", offsetHours: 5 },
  { id: "Indian/Maldives", city: "Maldives", offsetHours: 5 },
  // UTC+5:30
  { id: "Asia/Colombo", city: "Colombo", offsetHours: 5 },
  { id: "Asia/Kathmandu", city: "Kathmandu", offsetHours: 6 },
  // UTC+6
  { id: "Asia/Almaty", city: "Almaty", offsetHours: 6 },
  { id: "Asia/Dhaka", city: "Dhaka", offsetHours: 6 },
  { id: "Asia/Thimphu", city: "Thimphu", offsetHours: 6 },
  { id: "Asia/Novosibirsk", city: "Novosibirsk", offsetHours: 6 },
  { id: "Asia/Omsk", city: "Omsk", offsetHours: 6 },
  // UTC+6:30
  { id: "Asia/Yangon", city: "Yangon", offsetHours: 6 },
  // UTC+7
  { id: "Asia/Bangkok", city: "Bangkok", offsetHours: 7 },
  { id: "Asia/Jakarta", city: "Jakarta", offsetHours: 7 },
  { id: "Asia/Ho_Chi_Minh", city: "Ho Chi Minh", offsetHours: 7 },
  { id: "Asia/Phnom_Penh", city: "Phnom Penh", offsetHours: 7 },
  { id: "Asia/Krasnoyarsk", city: "Krasnoyarsk", offsetHours: 7 },
  // UTC+8
  { id: "Asia/Shanghai", city: "Shanghai", offsetHours: 8 },
  { id: "Asia/Hong_Kong", city: "Hong Kong", offsetHours: 8 },
  { id: "Asia/Taipei", city: "Taipei", offsetHours: 8 },
  { id: "Asia/Singapore", city: "Singapore", offsetHours: 8 },
  { id: "Asia/Kuala_Lumpur", city: "Kuala Lumpur", offsetHours: 8 },
  { id: "Asia/Manila", city: "Manila", offsetHours: 8 },
  { id: "Asia/Makassar", city: "Makassar", offsetHours: 8 },
  { id: "Asia/Irkutsk", city: "Irkutsk", offsetHours: 8 },
  { id: "Australia/Perth", city: "Perth", offsetHours: 8 },
  // UTC+9
  { id: "Asia/Tokyo", city: "Tokyo", offsetHours: 9 },
  { id: "Asia/Seoul", city: "Seoul", offsetHours: 9 },
  { id: "Asia/Pyongyang", city: "Pyongyang", offsetHours: 9 },
  { id: "Asia/Yakutsk", city: "Yakutsk", offsetHours: 9 },
  { id: "Asia/Chita", city: "Chita", offsetHours: 9 },
  // UTC+9:30
  { id: "Australia/Adelaide", city: "Adelaide", offsetHours: 9 },
  { id: "Australia/Darwin", city: "Darwin", offsetHours: 9 },
  // UTC+10
  { id: "Australia/Sydney", city: "Sydney", offsetHours: 10 },
  { id: "Australia/Melbourne", city: "Melbourne", offsetHours: 10 },
  { id: "Australia/Brisbane", city: "Brisbane", offsetHours: 10 },
  { id: "Australia/Hobart", city: "Hobart", offsetHours: 10 },
  { id: "Pacific/Port_Moresby", city: "Port Moresby", offsetHours: 10 },
  { id: "Asia/Vladivostok", city: "Vladivostok", offsetHours: 10 },
  // UTC+11
  { id: "Pacific/Noumea", city: "Noumea", offsetHours: 11 },
  { id: "Asia/Magadan", city: "Magadan", offsetHours: 11 },
  { id: "Asia/Sakhalin", city: "Sakhalin", offsetHours: 11 },
  // UTC+12
  { id: "Pacific/Auckland", city: "Auckland", offsetHours: 12 },
  { id: "Pacific/Fiji", city: "Fiji", offsetHours: 12 },
  { id: "Asia/Kamchatka", city: "Kamchatka", offsetHours: 12 },
  // UTC+13
  { id: "Pacific/Tongatapu", city: "Nuku'alofa", offsetHours: 13 },
  { id: "Pacific/Apia", city: "Apia", offsetHours: 13 },
  { id: "Pacific/Fakaofo", city: "Fakaofo", offsetHours: 13 },
  // UTC+14
  { id: "Pacific/Kiritimati", city: "Kiritimati", offsetHours: 14 },
];

/** Devuelve true si el IANA id es soportado por el runtime actual
 *  (Windows / Node / browser). Filtramos los que lanzarían
 *  RangeError "Invalid time zone specified" al instanciar
 *  Intl.DateTimeFormat. */
function isTzSupported(id: string): boolean {
  if (id === "UTC") return true; // UTC siempre soportado, sin try/catch
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: id });
    return true;
  } catch {
    return false;
  }
}

export const TZ_CATALOG: TzOption[] = RAW_TZ_CATALOG.filter((t) =>
  isTzSupported(t.id),
);

/** Format corto del offset de un TzOption, estilo "UTC-4" / "UTC+8". */
export function tzOptionOffsetLabel(opt: TzOption): string {
  const h = opt.offsetHours;
  if (h === 0) return "UTC+0";
  return `UTC${h > 0 ? "+" : ""}${h}`;
}

// ───────────────────────────────────────────────────────────────────
//  Formatters horarios para lightweight-charts.
//  Las velas de Binance vienen con `time` = epoch UTC en segundos.
//  Por default lwc pinta el eje X en UTC. Estos formatters permiten
//  pintar las horas según una TZ arbitraría usando Intl.DateTimeFormat
//  con la opción timeZone, que respeta DST automáticamente.
// ───────────────────────────────────────────────────────────────────

/** Normaliza el tzId: si el runtime no lo soporta, devuelve "UTC". */
function safeTzId(tzId: string): string {
  if (!tzId) return "UTC";
  if (tzId === "UTC") return tzId;
  if (!isTzSupported(tzId)) return "UTC";
  return tzId;
}

/** Devuelve un formatter para los ticks del eje X según la TZ dada.
 *  Recibe (time: number) -> string formateada para la escala temporal. */
export function makeTickFormatter(
  tzId: string,
): (time: number) => string {
  const safeId = safeTzId(tzId);
  // Para que el formatter decida el patrón (HH:MM, DD MMM, etc.)
  // dependiendo del timeframe, no sólo usamos uno fijo — dejamos
  // que Intl lo elija según la cercanía de los ticks vía options.
  const hm = new Intl.DateTimeFormat("en-US", {
    timeZone: safeId,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const dm = new Intl.DateTimeFormat("en-US", {
    timeZone: safeId,
    day: "2-digit",
    month: "short",
  });
  // Devolvemos una función que pinta "HH:MM" si el tick cae en una
  // hora distinta a la anterior cercana, o "DD MMM" si es el primer
  // tick del día. Como lwc a veces agrupa velas nos quedamos con un
  // criterio mixto: si el tick corresponde al primer minuto del día
  // usamos "DD MMM", si no "HH:MM".
  return (time: number) => {
    const date = new Date(time * 1000);
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: safeId,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      day: "2-digit",
    }).formatToParts(date);
    const hour = parts.find((p) => p.type === "hour")?.value ?? "00";
    const min = parts.find((p) => p.type === "minute")?.value ?? "00";
    const day = parts.find((p) => p.type === "day")?.value ?? "01";
    // Si la hora es 00:00 exacta (medianoche), mostrar fecha en vez
    // de "00:00", más útil para velas diarias o mayores.
    if (hour === "24" || (hour === "00" && min === "00")) {
      const monthFull = new Intl.DateTimeFormat("en-US", {
        timeZone: safeId,
        month: "short",
      }).format(date);
      return `${day} ${monthFull}`;
    }
    return `${hour}:${min}`;
  };
}

/** Formatter para el crosshair tooltip superior (hora completa con fecha). */
export function makeTimeFormatter(
  tzId: string,
): (time: number) => string {
  const safeId = safeTzId(tzId);
  return (time: number) => {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: safeId,
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(time * 1000));
  };
}
