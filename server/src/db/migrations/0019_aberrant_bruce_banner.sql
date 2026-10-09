CREATE TABLE "eval_agent_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"agent_version" integer NOT NULL,
	"system_prompt" text NOT NULL,
	"model" text NOT NULL,
	"ran_at" timestamp with time zone DEFAULT now() NOT NULL,
	"recall" double precision,
	"precision" double precision,
	"citation_accuracy" double precision,
	"traces_passed" integer DEFAULT 0 NOT NULL,
	"traces_total" integer DEFAULT 0 NOT NULL,
	"duration_ms" integer,
	"cost_usd" numeric(12, 6)
);
--> statement-breakpoint
ALTER TABLE "eval_cases" ADD COLUMN "expectation_kind" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "eval_cases" ADD COLUMN "source_finding_id" uuid;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "agent_run_id" uuid;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "status" text DEFAULT 'ok' NOT NULL;--> statement-breakpoint
ALTER TABLE "eval_agent_runs" ADD CONSTRAINT "eval_agent_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_agent_runs" ADD CONSTRAINT "eval_agent_runs_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD CONSTRAINT "eval_runs_agent_run_id_eval_agent_runs_id_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."eval_agent_runs"("id") ON DELETE cascade ON UPDATE no action;