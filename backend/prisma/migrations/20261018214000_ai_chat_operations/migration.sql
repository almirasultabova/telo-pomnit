CREATE TABLE "ai_chat_operations" (
  "user_id" TEXT NOT NULL,
  "operation_id" TEXT NOT NULL,
  "request_hash" TEXT NOT NULL,
  "session_id" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "result" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_chat_operations_pkey" PRIMARY KEY ("user_id", "operation_id"),
  CONSTRAINT "ai_chat_operations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ai_chat_operations_status_check" CHECK ("status" IN ('pending', 'completed', 'failed', 'uncertain'))
);
CREATE INDEX "ai_chat_operations_user_id_session_id_status_idx" ON "ai_chat_operations"("user_id", "session_id", "status");
