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
 * Follows the strict rule: "Do not replace it with generic messages."
 * If both `error` and `message` are present and distinct, formats as `${error} — ${message}`.
 */
export function extractBackendErrorMessage(responseStatus: number, responseBody: any): string {
  if (!responseBody) {
    return `Backend HTTP ${responseStatus} error`;
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

  const errorField = responseBody.error ? String(responseBody.error).trim() : '';
  const messageField = responseBody.message ? String(responseBody.message).trim() : '';
  const reasonField = responseBody.reason ? String(responseBody.reason).trim() : '';
  const detailsField = responseBody.details
    ? typeof responseBody.details === 'string'
      ? responseBody.details.trim()
      : JSON.stringify(responseBody.details)
    : '';

  // Case 1: Both error and message exist and are distinct
  if (errorField && messageField && errorField.toLowerCase() !== messageField.toLowerCase()) {
    return `${errorField} — ${messageField}`;
  }

  // Case 2: Only message exists
  if (messageField) {
    return messageField;
  }

  // Case 3: Only error exists
  if (errorField) {
    return errorField;
  }

  // Case 4: reason exists (e.g. rejected reasons)
  if (reasonField) {
    return reasonField;
  }

  // Case 5: details exists
  if (detailsField) {
    return detailsField;
  }

  // Case 6: Array of rejection objects
  if (Array.isArray(responseBody.rejected) && responseBody.rejected.length > 0) {
    const firstReject = responseBody.rejected[0];
    const rejectReason = firstReject?.reason || firstReject?.error || firstReject?.message;
    if (rejectReason) {
      return String(rejectReason);
    }
  }

  return `Backend returned HTTP ${responseStatus}`;
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
