export { API_BASE_URL, API_V1_PREFIX, DEFAULT_TIMEOUT_MS } from './config'
export { ApiError, describeApiError, isApiError } from './errors'
export type { ApiErrorKind } from './errors'
export { requestJson } from './client'
export type { RequestOptions } from './client'
export {
  fetchHealth,
  fetchReady,
  isReady,
  parseHealthResponse,
  parseReadyResponse,
} from './health'
export type { HealthResponse, ReadyResponse } from './health'
export { checkBackend } from './connection'
export type { ConnectionPhase, ConnectionResult, ConnectionDeps } from './connection'
export {
  submitClaim,
  parseClaimAnalysisResponse,
  describeSubmitError,
  SUBMIT_TIMEOUT_MS,
} from './claims'
export type {
  ClaimRequest,
  ClaimAnalysisResponse,
  SubmitErrorInfo,
} from './claims'
export {
  getClaimById,
  getAnalysisById,
  getClaimAnalysisHistory,
  parseClaimDetails,
  parseSavedAnalysis,
  parseAnalysisHistoryPage,
  DEFAULT_HISTORY_LIMIT,
  DEFAULT_HISTORY_OFFSET,
  DEFAULT_HISTORY_ORDER,
} from './retrieval'
export type {
  ClaimDetails,
  SavedAnalysis,
  SavedAnalysisFraud,
  SavedAnalysisSeverity,
  SavedAnalysisAnomaly,
  SavedAnalysisRisk,
  AnalysisHistoryItem,
  AnalysisHistoryPage,
  AnalysisHistoryOrder,
  AnalysisHistoryQuery,
  AnalysisHistoryOptions,
} from './retrieval'
