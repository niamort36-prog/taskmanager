/** Liens d'itinéraire : ouvrent l'app de navigation du téléphone (ou le site). */
export const mapsUrl = (address: string) =>
  `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`

export const wazeUrl = (address: string) => `https://waze.com/ul?q=${encodeURIComponent(address)}&navigate=yes`

/** "12 rue de la République, 69002 Lyon" -> "12 rue de la République" (affichage court). */
export const shortAddress = (address: string) => address.split(',')[0].trim()
