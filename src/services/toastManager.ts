/**
 * Global Toast & Backend Error Notification Manager
 * 
 * Provides unified toast dispatching and strict backend error extraction.
 */

export type ToastType = 'success' | 'error' | 'info';

export interface ToastPayload {
  message: string;
  type: ToastType;
  duration?: number;
  id?: string;
}

/**
 * Dispatches a toast notification globally across the application.
 */
export function dispatchToast(message: string, type: ToastType = 'info', duration: number = 6000): void {
  if (!message || typeof window === 'undefined') return;

  const event = new CustomEvent<ToastPayload>('tokencare:toast', {
    detail: {
      message,
      type,
      duration,
      id: `toast-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    },
  });

  window.dispatchEvent(event);
}

/**
 * Extracts the most accurate and descriptive error message from a backend response.
 * Preserves the exact error message and details returned by the Edge Function or backend.
 */
export function extractBackendErrorMessage(responseStatus: number, responseBody: any): string {
  if (!responseBody) {
    return responseStatus ? `Backend HTTP ${responseStatus} error` : 'Unknown backend error';
  }

  if (typeof responseBody === 'string') {
    const trimmed = responseBody.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        return extractBackendErrorMessage(responseStatus, parsed);
      } catch {}
    }
    return trimmed.length > 0 ? trimmed : `Backend HTTP ${responseStatus} error`;
  }

  // Handle nested error objects: responseBody.error = { message: "...", details: "..." }
  let errorField = '';
  if (responseBody.error) {
    if (typeof responseBody.error === 'string') {
      errorField = responseBody.error.trim();
    } else if (typeof responseBody.error === 'object') {
      const nestedMsg =
        responseBody.error.message ||
        responseBody.error.details ||
        responseBody.error.error ||
        responseBody.error.description ||
        responseBody.error.reason;
      if (nestedMsg && typeof nestedMsg === 'string') {
        errorField = nestedMsg.trim();
      } else {
        errorField = JSON.stringify(responseBody.error);
      }
    }
  }

  const messageField = responseBody.message
    ? typeof responseBody.message === 'string'
      ? responseBody.message.trim()
      : JSON.stringify(responseBody.message)
    : '';

  const reasonField = responseBody.reason
    ? typeof responseBody.reason === 'string'
      ? responseBody.reason.trim()
      : JSON.stringify(responseBody.reason)
    : '';

  const detailsField = responseBody.details
    ? typeof responseBody.details === 'string'
      ? responseBody.details.trim()
      : JSON.stringify(responseBody.details)
    : '';

  const upstreamField =
    responseBody.upstreamError ||
    responseBody.upstream_error ||
    responseBody.upstreamResponse ||
    responseBody.edgeError ||
    responseBody.edge_error ||
    responseBody.workerError ||
    responseBody.worker_error ||
    responseBody.cause ||
    responseBody.error_description ||
    responseBody.description;

  const upstreamStr = upstreamField
    ? typeof upstreamField === 'string'
      ? upstreamField.trim()
      : typeof upstreamField === 'object' && upstreamField.message
      ? String(upstreamField.message).trim()
      : JSON.stringify(upstreamField)
    : '';

  // Gather all informative pieces of the error
  const detailsParts: string[] = [];

  // Check rejected array
  if (Array.isArray(responseBody.rejected) && responseBody.rejected.length > 0) {
    for (const r of responseBody.rejected) {
      const rejectReason = r?.reason || r?.error || r?.message || r?.details;
      if (rejectReason) {
        const text = typeof rejectReason === 'string' ? rejectReason.trim() : JSON.stringify(rejectReason);
        if (text && !detailsParts.includes(text)) {
          detailsParts.push(text);
        }
      }
    }
  }

  if (messageField && !detailsParts.includes(messageField)) detailsParts.push(messageField);
  if (detailsField && !detailsParts.includes(detailsField)) detailsParts.push(detailsField);
  if (reasonField && !detailsParts.includes(reasonField)) detailsParts.push(reasonField);
  if (upstreamStr && !detailsParts.includes(upstreamStr)) detailsParts.push(upstreamStr);

  // If we have detailed explanation parts from the edge function
  if (detailsParts.length > 0) {
    const detailedMessage = detailsParts.join(' — ');

    // If errorField is a generic code (e.g. CLOUDFLARE_UPLOAD_FAILED, BACKEND_ERROR, SAVE_ERROR),
    // show the exact specific error message from the edge function first
    const isGenericCode = /^[A-Z0-9_-]+$/.test(errorField) && errorField.length < 35;
    if (isGenericCode && detailedMessage.length > 0) {
      return detailedMessage;
    }

    if (errorField && !detailedMessage.toLowerCase().includes(errorField.toLowerCase())) {
      return `${detailedMessage} (${errorField})`;
    }
    return detailedMessage;
  }

  // Fallback to error field if only error is present
  if (errorField) {
    return errorField;
  }

  return `Backend returned HTTP ${responseStatus || 'error'}`;
}

/**
 * Logs the full error response for development debugging and triggers a toast notification.
 */
export function notifyBackendError(
  responseStatus: number,
  responseBody: any,
  contextLabel?: string
): string {
  // Exact required development logging format:
  // HTTP status: 400
  // Backend response: {...}
  console.error(
    `[${contextLabel || 'Backend API'}] HTTP status: ${responseStatus}\nBackend response:`,
    responseBody
  );

  const parsedMessage = extractBackendErrorMessage(responseStatus, responseBody);
  dispatchToast(parsedMessage, 'error', 7000);
  return parsedMessage;
}
