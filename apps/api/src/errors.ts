/** Erreur métier avec son code HTTP ; le MCP la renvoie en résultat d'erreur lisible. */
// Pas de propriété de constructeur : Node exécute ces sources TS en retirant les types, sans transformer.
export class HttpError extends Error {
  readonly statusCode: number
  constructor(statusCode: number, message: string) {
    super(message)
    this.statusCode = statusCode
  }
}
