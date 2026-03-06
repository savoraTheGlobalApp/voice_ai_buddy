"""
Request logging middleware.
Logs one JSON line per request with timing, status, and request ID.
Captures unhandled exceptions with full context before re-raising.
"""
import logging
import time
import uuid

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

logger = logging.getLogger(__name__)

# Paths to skip logging (too noisy / not useful)
_SKIP_PATHS = {"/health", "/favicon.ico"}


class RequestLoggerMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        if request.url.path in _SKIP_PATHS:
            return await call_next(request)

        request_id = uuid.uuid4().hex[:8]
        request.state.request_id = request_id

        start = time.perf_counter()

        try:
            response = await call_next(request)
        except Exception as exc:
            duration_ms = round((time.perf_counter() - start) * 1000, 1)
            logger.exception(
                "unhandled_exception",
                extra={
                    "request_id": request_id,
                    "method": request.method,
                    "path": request.url.path,
                    "duration_ms": duration_ms,
                    "uid": getattr(request.state, "uid", None),
                    "error": str(exc),
                },
            )
            raise

        duration_ms = round((time.perf_counter() - start) * 1000, 1)

        log_fn = logger.warning if response.status_code >= 500 else logger.info
        log_fn(
            "request",
            extra={
                "request_id": request_id,
                "method": request.method,
                "path": request.url.path,
                "status": response.status_code,
                "duration_ms": duration_ms,
                "uid": getattr(request.state, "uid", None),
            },
        )

        response.headers["X-Request-ID"] = request_id
        return response
