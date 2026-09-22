export { EmailService } from "./service";
export { getEmailProvider, mockProvider, __resetEmailProviderForTests } from "./provider-factory";
export { renderTemplate, extractVariables, assertRequiredVariables, MissingVariableError } from "./render";
export { checkSuppression, addSuppression } from "./suppression";
export {
  marketingIdempotencyKey,
  transactionalIdempotencyKey,
} from "./idempotency";
export type {
  EmailProvider,
  ProviderEvent,
  ProviderSendPayload,
  ProviderSendResult,
  QueueMarketingEmailInput,
  QueueTransactionalEmailInput,
  EnqueueResult,
} from "./types";
export { ProviderError } from "./types";
