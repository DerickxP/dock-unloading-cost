/** Erro da API já traduzido: status HTTP, mensagem legível e campo, quando houver. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly field?: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  static async fromResponse(response: Response): Promise<ApiError> {
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    const b = (body ?? {}) as { message?: unknown; field?: string; missing?: string[] };
    const message = Array.isArray(b.message)
      ? b.message.join('; ')
      : typeof b.message === 'string'
        ? b.message
        : response.status === 403
          ? 'Sem permissão: informe a chave de administração nas configurações'
          : `Erro ${response.status}`;
    return new ApiError(response.status, message, b.field, body);
  }
}
