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

  const errorField = responseBody.error
    ? typeof responseBody.error === 'string'
      ? responseBody.error.trim()
      : JSON.stringify(responseBody.error)
    : '';

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

  const upstreamField = responseBody.upstreamError || responseBody.upstream_error || responseBody.cause || responseBody.error_description;
  const upstreamStr = upstreamField
    ? typeof upstreamField === 'string'
      ? upstreamField.trim()
      : JSON.stringify(upstreamField)
    : '';

  // Gather all informative pieces of the error
  const detailsParts: string[] = [];

  if (messageField) detailsParts.push(messageField);
  if (detailsField && detailsField !== messageField) detailsParts.push(detailsField);
  if (reasonField && reasonField !== messageField && reasonField !== detailsField) detailsParts.push(reasonField);
  if (upstreamStr && !detailsParts.includes(upstreamStr)) detailsParts.push(upstreamStr);

  // If we have detailed explanation parts
  if (detailsParts.length > 0) {
    const detailedMessage = detailsParts.join(' — ');

    // If there is also an error code (e.g. CLOUDFLARE_UPLOAD_FAILED) and it's not already in the detailed message:
    if (errorField && !detailedMessage.toLowerCase().includes(errorField.toLowerCase())) {
      return `${errorField}: ${detailedMessage}`;
    }
    return detailedMessage;
  }

  // Fallback to error field if only error is present
  if (errorField) {
    return errorField;
  }

  // Check rejected array
  if (Array.isArray(responseBody.rejected) && responseBody.rejected.length > 0) {
    const firstReject = responseBody.rejected[0];
    const rejectReason = firstReject?.reason || firstReject?.error || firstReject?.message;
    if (rejectReason) {
      return typeof rejectReason === 'string' ? rejectReason : JSON.stringify(rejectReason);
    }
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
