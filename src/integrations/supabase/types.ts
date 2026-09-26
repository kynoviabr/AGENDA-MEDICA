export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      access_group_permissions: {
        Row: {
          can_view: boolean
          clinic_id: string
          created_at: string
          group_id: string
          id: string
          permission_key: string
          updated_at: string
        }
        Insert: {
          can_view?: boolean
          clinic_id: string
          created_at?: string
          group_id: string
          id?: string
          permission_key: string
          updated_at?: string
        }
        Update: {
          can_view?: boolean
          clinic_id?: string
          created_at?: string
          group_id?: string
          id?: string
          permission_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "access_group_permissions_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "access_group_permissions_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "access_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      access_groups: {
        Row: {
          clinic_id: string
          code: string
          created_at: string
          description: string | null
          id: string
          is_system: boolean
          name: string
          status: string
          updated_at: string
        }
        Insert: {
          clinic_id: string
          code: string
          created_at?: string
          description?: string | null
          id?: string
          is_system?: boolean
          name: string
          status?: string
          updated_at?: string
        }
        Update: {
          clinic_id?: string
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          is_system?: boolean
          name?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "access_groups_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      administrative_knowledge_entries: {
        Row: {
          answer: string
          clinic_id: string
          created_at: string
          id: string
          insurance_id: string | null
          keywords: string[]
          location_id: string | null
          patient_visible: boolean
          priority: number
          professional_id: string | null
          question: string
          revision: number
          scope: string
          service_id: string | null
          status: string
          topic: string
          updated_at: string
          valid_from: string | null
          valid_until: string | null
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          answer: string
          clinic_id: string
          created_at?: string
          id?: string
          insurance_id?: string | null
          keywords?: string[]
          location_id?: string | null
          patient_visible?: boolean
          priority?: number
          professional_id?: string | null
          question: string
          revision?: number
          scope?: string
          service_id?: string | null
          status?: string
          topic: string
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          answer?: string
          clinic_id?: string
          created_at?: string
          id?: string
          insurance_id?: string | null
          keywords?: string[]
          location_id?: string | null
          patient_visible?: boolean
          priority?: number
          professional_id?: string | null
          question?: string
          revision?: number
          scope?: string
          service_id?: string | null
          status?: string
          topic?: string
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "administrative_knowledge_entries_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "administrative_knowledge_entries_insurance_clinic_fkey"
            columns: ["insurance_id", "clinic_id"]
            isOneToOne: false
            referencedRelation: "health_insurances"
            referencedColumns: ["id", "clinic_id"]
          },
          {
            foreignKeyName: "administrative_knowledge_entries_location_clinic_fkey"
            columns: ["location_id", "clinic_id"]
            isOneToOne: false
            referencedRelation: "clinic_locations"
            referencedColumns: ["id", "clinic_id"]
          },
          {
            foreignKeyName: "administrative_knowledge_entries_professional_clinic_fkey"
            columns: ["professional_id", "clinic_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id", "clinic_id"]
          },
          {
            foreignKeyName: "administrative_knowledge_entries_service_clinic_fkey"
            columns: ["service_id", "clinic_id"]
            isOneToOne: false
            referencedRelation: "treatments"
            referencedColumns: ["id", "clinic_id"]
          },
        ]
      }
      agenda_job_executions: {
        Row: {
          clinic_id: string | null
          created_at: string
          details: Json | null
          finished_at: string | null
          id: string
          job_name: string
          run_key: string
          started_at: string
          status: string
        }
        Insert: {
          clinic_id?: string | null
          created_at?: string
          details?: Json | null
          finished_at?: string | null
          id?: string
          job_name: string
          run_key: string
          started_at?: string
          status?: string
        }
        Update: {
          clinic_id?: string | null
          created_at?: string
          details?: Json | null
          finished_at?: string | null
          id?: string
          job_name?: string
          run_key?: string
          started_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "agenda_job_executions_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_admin_action_events: {
        Row: {
          action: string
          actor_user_id: string | null
          clinic_id: string
          id: string
          next_state: Json
          occurred_at: string
          previous_state: Json
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          clinic_id: string
          id?: string
          next_state?: Json
          occurred_at?: string
          previous_state?: Json
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          clinic_id?: string
          id?: string
          next_state?: Json
          occurred_at?: string
          previous_state?: Json
        }
        Relationships: [
          {
            foreignKeyName: "ai_admin_action_events_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_conversation_handoffs: {
        Row: {
          accepted_at: string | null
          assigned_at: string | null
          assigned_user_id: string | null
          clinic_id: string
          conversation_id: string
          correlation_id: string | null
          created_at: string
          id: string
          priority: string
          reason: string
          requested_at: string
          requested_by: string | null
          resolution: string | null
          resolved_at: string | null
          sanitized_description: string | null
          source: string
          status: string
          summary: Json
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          assigned_at?: string | null
          assigned_user_id?: string | null
          clinic_id: string
          conversation_id: string
          correlation_id?: string | null
          created_at?: string
          id?: string
          priority?: string
          reason: string
          requested_at?: string
          requested_by?: string | null
          resolution?: string | null
          resolved_at?: string | null
          sanitized_description?: string | null
          source: string
          status?: string
          summary?: Json
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          assigned_at?: string | null
          assigned_user_id?: string | null
          clinic_id?: string
          conversation_id?: string
          correlation_id?: string | null
          created_at?: string
          id?: string
          priority?: string
          reason?: string
          requested_at?: string
          requested_by?: string | null
          resolution?: string | null
          resolved_at?: string | null
          sanitized_description?: string | null
          source?: string
          status?: string
          summary?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_conversation_handoffs_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_conversation_handoffs_conversation_tenant_fk"
            columns: ["conversation_id", "clinic_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_ai_conversations"
            referencedColumns: ["id", "clinic_id"]
          },
        ]
      }
      ai_handoff_events: {
        Row: {
          action: string
          actor_user_id: string | null
          clinic_id: string
          conversation_id: string
          handoff_id: string
          id: string
          occurred_at: string
          reason: string | null
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          clinic_id: string
          conversation_id: string
          handoff_id: string
          id?: string
          occurred_at?: string
          reason?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          clinic_id?: string
          conversation_id?: string
          handoff_id?: string
          id?: string
          occurred_at?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_handoff_events_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_handoff_events_conversation_tenant_fk"
            columns: ["conversation_id", "clinic_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_ai_conversations"
            referencedColumns: ["id", "clinic_id"]
          },
          {
            foreignKeyName: "ai_handoff_events_handoff_tenant_fk"
            columns: ["handoff_id", "clinic_id"]
            isOneToOne: false
            referencedRelation: "ai_conversation_handoffs"
            referencedColumns: ["id", "clinic_id"]
          },
        ]
      }
      ai_knowledge_answer_events: {
        Row: {
          clinic_id: string
          conversation_id: string
          correlation_id: string
          created_at: string
          id: string
          latency_ms: number
          occurred_at: string
          outcome: string
          source_refs: Json
          topic: string
        }
        Insert: {
          clinic_id: string
          conversation_id: string
          correlation_id: string
          created_at?: string
          id?: string
          latency_ms: number
          occurred_at?: string
          outcome: string
          source_refs?: Json
          topic: string
        }
        Update: {
          clinic_id?: string
          conversation_id?: string
          correlation_id?: string
          created_at?: string
          id?: string
          latency_ms?: number
          occurred_at?: string
          outcome?: string
          source_refs?: Json
          topic?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_knowledge_answer_events_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_knowledge_answer_events_conversation_clinic_fkey"
            columns: ["conversation_id", "clinic_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_ai_conversations"
            referencedColumns: ["id", "clinic_id"]
          },
        ]
      }
      ai_operational_events: {
        Row: {
          channel: string
          clinic_id: string
          component: string
          conversation_id: string | null
          correlation_id: string
          created_at: string
          error_category: string | null
          error_code: string | null
          event_type: string
          id: string
          latency_ms: number | null
          occurred_at: string
          outcome: string
          retryable: boolean | null
        }
        Insert: {
          channel?: string
          clinic_id: string
          component: string
          conversation_id?: string | null
          correlation_id: string
          created_at?: string
          error_category?: string | null
          error_code?: string | null
          event_type: string
          id?: string
          latency_ms?: number | null
          occurred_at?: string
          outcome: string
          retryable?: boolean | null
        }
        Update: {
          channel?: string
          clinic_id?: string
          component?: string
          conversation_id?: string | null
          correlation_id?: string
          created_at?: string
          error_category?: string | null
          error_code?: string | null
          event_type?: string
          id?: string
          latency_ms?: number | null
          occurred_at?: string
          outcome?: string
          retryable?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_operational_events_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_operational_events_conversation_tenant_fk"
            columns: ["conversation_id", "clinic_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_ai_conversations"
            referencedColumns: ["id", "clinic_id"]
          },
        ]
      }
      ai_safety_events: {
        Row: {
          categories: string[]
          clinic_id: string
          conversation_id: string
          correlation_id: string
          created_at: string
          disposition: string
          grounded: boolean
          id: string
          latency_ms: number
          occurred_at: string
          validator: string
        }
        Insert: {
          categories?: string[]
          clinic_id: string
          conversation_id: string
          correlation_id: string
          created_at?: string
          disposition: string
          grounded: boolean
          id?: string
          latency_ms: number
          occurred_at?: string
          validator: string
        }
        Update: {
          categories?: string[]
          clinic_id?: string
          conversation_id?: string
          correlation_id?: string
          created_at?: string
          disposition?: string
          grounded?: boolean
          id?: string
          latency_ms?: number
          occurred_at?: string
          validator?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_safety_events_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_safety_events_conversation_clinic_fkey"
            columns: ["conversation_id", "clinic_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_ai_conversations"
            referencedColumns: ["id", "clinic_id"]
          },
        ]
      }
      ai_tool_execution_events: {
        Row: {
          clinic_id: string
          conversation_id: string
          correlation_id: string
          created_at: string
          error_code: string | null
          id: string
          latency_ms: number
          occurred_at: string
          outcome: string
          tool_kind: string
          tool_name: string
        }
        Insert: {
          clinic_id: string
          conversation_id: string
          correlation_id: string
          created_at?: string
          error_code?: string | null
          id?: string
          latency_ms: number
          occurred_at?: string
          outcome: string
          tool_kind: string
          tool_name: string
        }
        Update: {
          clinic_id?: string
          conversation_id?: string
          correlation_id?: string
          created_at?: string
          error_code?: string | null
          id?: string
          latency_ms?: number
          occurred_at?: string
          outcome?: string
          tool_kind?: string
          tool_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_tool_execution_events_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_tool_execution_events_conversation_clinic_fkey"
            columns: ["conversation_id", "clinic_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_ai_conversations"
            referencedColumns: ["id", "clinic_id"]
          },
        ]
      }
      ai_tool_mutation_claims: {
        Row: {
          claimed_at: string
          clinic_id: string
          conversation_id: string
          correlation_id: string
          tool_name: string
        }
        Insert: {
          claimed_at?: string
          clinic_id: string
          conversation_id: string
          correlation_id: string
          tool_name: string
        }
        Update: {
          claimed_at?: string
          clinic_id?: string
          conversation_id?: string
          correlation_id?: string
          tool_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_tool_mutation_claims_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_tool_mutation_claims_conversation_clinic_fkey"
            columns: ["conversation_id", "clinic_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_ai_conversations"
            referencedColumns: ["id", "clinic_id"]
          },
        ]
      }
      ai_usage_events: {
        Row: {
          channel: string
          clinic_id: string
          conversation_id: string
          correlation_id: string
          created_at: string
          error_code: string | null
          id: string
          input_units: number | null
          message_type: string
          model: string | null
          occurred_at: string
          outcome: string
          output_units: number | null
          preprocessing_latency_ms: number | null
          provider: string
          provider_latency_ms: number | null
          request_type: string
          total_latency_ms: number
          total_units: number | null
        }
        Insert: {
          channel: string
          clinic_id: string
          conversation_id: string
          correlation_id: string
          created_at?: string
          error_code?: string | null
          id?: string
          input_units?: number | null
          message_type: string
          model?: string | null
          occurred_at?: string
          outcome: string
          output_units?: number | null
          preprocessing_latency_ms?: number | null
          provider: string
          provider_latency_ms?: number | null
          request_type: string
          total_latency_ms: number
          total_units?: number | null
        }
        Update: {
          channel?: string
          clinic_id?: string
          conversation_id?: string
          correlation_id?: string
          created_at?: string
          error_code?: string | null
          id?: string
          input_units?: number | null
          message_type?: string
          model?: string | null
          occurred_at?: string
          outcome?: string
          output_units?: number | null
          preprocessing_latency_ms?: number | null
          provider?: string
          provider_latency_ms?: number | null
          request_type?: string
          total_latency_ms?: number
          total_units?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_events_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_usage_events_conversation_clinic_fkey"
            columns: ["conversation_id", "clinic_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_ai_conversations"
            referencedColumns: ["id", "clinic_id"]
          },
        ]
      }
      appointment_blocks: {
        Row: {
          clinic_id: string
          created_at: string
          created_by: string | null
          end_at: string
          id: string
          location_id: string | null
          notes: string | null
          professional_id: string | null
          reason: string | null
          start_at: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          created_by?: string | null
          end_at: string
          id?: string
          location_id?: string | null
          notes?: string | null
          professional_id?: string | null
          reason?: string | null
          start_at: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          created_by?: string | null
          end_at?: string
          id?: string
          location_id?: string | null
          notes?: string | null
          professional_id?: string | null
          reason?: string | null
          start_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointment_blocks_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_blocks_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "clinic_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_blocks_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      appointment_reminders: {
        Row: {
          appointment_id: string
          channel: Database["public"]["Enums"]["reminder_channel"]
          clinic_id: string
          created_at: string
          error_message: string | null
          id: string
          payload: Json | null
          scheduled_for: string
          sent_at: string | null
          status: Database["public"]["Enums"]["reminder_status"]
        }
        Insert: {
          appointment_id: string
          channel?: Database["public"]["Enums"]["reminder_channel"]
          clinic_id: string
          created_at?: string
          error_message?: string | null
          id?: string
          payload?: Json | null
          scheduled_for: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["reminder_status"]
        }
        Update: {
          appointment_id?: string
          channel?: Database["public"]["Enums"]["reminder_channel"]
          clinic_id?: string
          created_at?: string
          error_message?: string | null
          id?: string
          payload?: Json | null
          scheduled_for?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["reminder_status"]
        }
        Relationships: [
          {
            foreignKeyName: "appointment_reminders_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_reminders_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      appointment_waitlist: {
        Row: {
          clinic_id: string
          contact_phone: string | null
          contact_preference: Database["public"]["Enums"]["waitlist_contact_preference"]
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          last_checked_at: string | null
          lead_id: string | null
          match_found_at: string | null
          min_duration_minutes: number
          notes: string | null
          patient_id: string | null
          preferred_periods: string[]
          preferred_professional_id: string | null
          priority: Database["public"]["Enums"]["waitlist_priority"]
          resulting_appointment_id: string | null
          status: Database["public"]["Enums"]["waitlist_status"]
          treatment_id: string | null
          updated_at: string
          window_end: string
          window_start: string
          window_type: Database["public"]["Enums"]["waitlist_window_type"]
        }
        Insert: {
          clinic_id: string
          contact_phone?: string | null
          contact_preference?: Database["public"]["Enums"]["waitlist_contact_preference"]
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          last_checked_at?: string | null
          lead_id?: string | null
          match_found_at?: string | null
          min_duration_minutes?: number
          notes?: string | null
          patient_id?: string | null
          preferred_periods?: string[]
          preferred_professional_id?: string | null
          priority?: Database["public"]["Enums"]["waitlist_priority"]
          resulting_appointment_id?: string | null
          status?: Database["public"]["Enums"]["waitlist_status"]
          treatment_id?: string | null
          updated_at?: string
          window_end: string
          window_start: string
          window_type: Database["public"]["Enums"]["waitlist_window_type"]
        }
        Update: {
          clinic_id?: string
          contact_phone?: string | null
          contact_preference?: Database["public"]["Enums"]["waitlist_contact_preference"]
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          last_checked_at?: string | null
          lead_id?: string | null
          match_found_at?: string | null
          min_duration_minutes?: number
          notes?: string | null
          patient_id?: string | null
          preferred_periods?: string[]
          preferred_professional_id?: string | null
          priority?: Database["public"]["Enums"]["waitlist_priority"]
          resulting_appointment_id?: string | null
          status?: Database["public"]["Enums"]["waitlist_status"]
          treatment_id?: string | null
          updated_at?: string
          window_end?: string
          window_start?: string
          window_type?: Database["public"]["Enums"]["waitlist_window_type"]
        }
        Relationships: [
          {
            foreignKeyName: "appointment_waitlist_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_waitlist_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_waitlist_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_waitlist_preferred_professional_id_fkey"
            columns: ["preferred_professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_waitlist_resulting_appointment_id_fkey"
            columns: ["resulting_appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_waitlist_treatment_id_fkey"
            columns: ["treatment_id"]
            isOneToOne: false
            referencedRelation: "treatments"
            referencedColumns: ["id"]
          },
        ]
      }
      appointment_whatsapp_tokens: {
        Row: {
          appointment_id: string
          clinic_id: string
          consumed_at: string | null
          consumed_command: string | null
          created_at: string
          expires_at: string
          id: string
          status: Database["public"]["Enums"]["whatsapp_command_status"]
          token: string
        }
        Insert: {
          appointment_id: string
          clinic_id: string
          consumed_at?: string | null
          consumed_command?: string | null
          created_at?: string
          expires_at: string
          id?: string
          status?: Database["public"]["Enums"]["whatsapp_command_status"]
          token: string
        }
        Update: {
          appointment_id?: string
          clinic_id?: string
          consumed_at?: string | null
          consumed_command?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          status?: Database["public"]["Enums"]["whatsapp_command_status"]
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointment_whatsapp_tokens_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_whatsapp_tokens_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      appointments: {
        Row: {
          appointment_type: string
          batch_id: string | null
          billing_type: string
          cancelled_reason: string | null
          checked_in_at: string | null
          clinic_id: string
          completed_at: string | null
          confirmed_at: string | null
          connection_id: string | null
          contract_id: string | null
          contract_item_id: string | null
          created_at: string
          created_by: string | null
          credit_check_required: boolean
          credit_check_status: string
          credit_decision_id: string | null
          duration_minutes: number
          end_time: string
          event_origin: string
          external_appointment_id: string | null
          external_etag: string | null
          external_version: string | null
          health_insurance_id: string | null
          id: string
          is_batch: boolean
          is_tombstone: boolean
          last_provider_seen_at: string | null
          last_sync_error_at: string | null
          last_sync_error_code: string | null
          last_sync_error_message: string | null
          last_synced_at: string | null
          lead_id: string | null
          location_id: string | null
          no_show_reason: string | null
          notes: string | null
          patient_id: string | null
          professional_id: string | null
          provider_type: string
          raw_provider_status: string | null
          rescheduled_from: string | null
          rescheduled_to: string | null
          scheduled_at: string | null
          source_of_truth: string
          start_time: string
          status: Database["public"]["Enums"]["appointment_status"]
          sync_conflict_at: string | null
          sync_conflict_code: string | null
          sync_state: string
          tombstoned_at: string | null
          treatment_id: string | null
          unmapped_entity_types: string[]
          updated_at: string
        }
        Insert: {
          appointment_type?: string
          batch_id?: string | null
          billing_type?: string
          cancelled_reason?: string | null
          checked_in_at?: string | null
          clinic_id: string
          completed_at?: string | null
          confirmed_at?: string | null
          connection_id?: string | null
          contract_id?: string | null
          contract_item_id?: string | null
          created_at?: string
          created_by?: string | null
          credit_check_required?: boolean
          credit_check_status?: string
          credit_decision_id?: string | null
          duration_minutes?: number
          end_time: string
          event_origin?: string
          external_appointment_id?: string | null
          external_etag?: string | null
          external_version?: string | null
          health_insurance_id?: string | null
          id?: string
          is_batch?: boolean
          is_tombstone?: boolean
          last_provider_seen_at?: string | null
          last_sync_error_at?: string | null
          last_sync_error_code?: string | null
          last_sync_error_message?: string | null
          last_synced_at?: string | null
          lead_id?: string | null
          location_id?: string | null
          no_show_reason?: string | null
          notes?: string | null
          patient_id?: string | null
          professional_id?: string | null
          provider_type?: string
          raw_provider_status?: string | null
          rescheduled_from?: string | null
          rescheduled_to?: string | null
          scheduled_at?: string | null
          source_of_truth?: string
          start_time: string
          status?: Database["public"]["Enums"]["appointment_status"]
          sync_conflict_at?: string | null
          sync_conflict_code?: string | null
          sync_state?: string
          tombstoned_at?: string | null
          treatment_id?: string | null
          unmapped_entity_types?: string[]
          updated_at?: string
        }
        Update: {
          appointment_type?: string
          batch_id?: string | null
          billing_type?: string
          cancelled_reason?: string | null
          checked_in_at?: string | null
          clinic_id?: string
          completed_at?: string | null
          confirmed_at?: string | null
          connection_id?: string | null
          contract_id?: string | null
          contract_item_id?: string | null
          created_at?: string
          created_by?: string | null
          credit_check_required?: boolean
          credit_check_status?: string
          credit_decision_id?: string | null
          duration_minutes?: number
          end_time?: string
          event_origin?: string
          external_appointment_id?: string | null
          external_etag?: string | null
          external_version?: string | null
          health_insurance_id?: string | null
          id?: string
          is_batch?: boolean
          is_tombstone?: boolean
          last_provider_seen_at?: string | null
          last_sync_error_at?: string | null
          last_sync_error_code?: string | null
          last_sync_error_message?: string | null
          last_synced_at?: string | null
          lead_id?: string | null
          location_id?: string | null
          no_show_reason?: string | null
          notes?: string | null
          patient_id?: string | null
          professional_id?: string | null
          provider_type?: string
          raw_provider_status?: string | null
          rescheduled_from?: string | null
          rescheduled_to?: string | null
          scheduled_at?: string | null
          source_of_truth?: string
          start_time?: string
          status?: Database["public"]["Enums"]["appointment_status"]
          sync_conflict_at?: string | null
          sync_conflict_code?: string | null
          sync_state?: string
          tombstoned_at?: string | null
          treatment_id?: string | null
          unmapped_entity_types?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointments_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_connection_clinic_fkey"
            columns: ["connection_id", "clinic_id"]
            isOneToOne: false
            referencedRelation: "scheduling_provider_connections"
            referencedColumns: ["id", "clinic_id"]
          },
          {
            foreignKeyName: "appointments_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_health_insurance_clinic_fkey"
            columns: ["health_insurance_id", "clinic_id"]
            isOneToOne: false
            referencedRelation: "health_insurances"
            referencedColumns: ["id", "clinic_id"]
          },
          {
            foreignKeyName: "appointments_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "clinic_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_rescheduled_from_fkey"
            columns: ["rescheduled_from"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_rescheduled_to_fkey"
            columns: ["rescheduled_to"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_treatment_id_fkey"
            columns: ["treatment_id"]
            isOneToOne: false
            referencedRelation: "treatments"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          clinic_id: string
          created_at: string
          id: string
          ip_address: unknown
          new_data: Json | null
          old_data: Json | null
          record_id: string | null
          table_name: string
          user_id: string | null
        }
        Insert: {
          action: string
          clinic_id: string
          created_at?: string
          id?: string
          ip_address?: unknown
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name: string
          user_id?: string | null
        }
        Update: {
          action?: string
          clinic_id?: string
          created_at?: string
          id?: string
          ip_address?: unknown
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      class_entities: {
        Row: {
          abbreviation: string
          clinic_id: string
          created_at: string
          description: string | null
          id: string
          linked_professionals: string | null
          name: string
          status: string
          updated_at: string
        }
        Insert: {
          abbreviation: string
          clinic_id: string
          created_at?: string
          description?: string | null
          id?: string
          linked_professionals?: string | null
          name: string
          status?: string
          updated_at?: string
        }
        Update: {
          abbreviation?: string
          clinic_id?: string
          created_at?: string
          description?: string | null
          id?: string
          linked_professionals?: string | null
          name?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "class_entities_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      clinic_administrative_policies: {
        Row: {
          allowed_payment_methods: string[]
          arrival_instructions: string | null
          arrival_minutes: number | null
          cancellation_policy: string | null
          children_policy: string | null
          clinic_id: string
          companion_policy: string | null
          created_at: string
          first_consultation_information: string | null
          id: string
          late_policy: string | null
          required_documents: string[]
          updated_at: string
        }
        Insert: {
          allowed_payment_methods?: string[]
          arrival_instructions?: string | null
          arrival_minutes?: number | null
          cancellation_policy?: string | null
          children_policy?: string | null
          clinic_id: string
          companion_policy?: string | null
          created_at?: string
          first_consultation_information?: string | null
          id?: string
          late_policy?: string | null
          required_documents?: string[]
          updated_at?: string
        }
        Update: {
          allowed_payment_methods?: string[]
          arrival_instructions?: string | null
          arrival_minutes?: number | null
          cancellation_policy?: string | null
          children_policy?: string | null
          clinic_id?: string
          companion_policy?: string | null
          created_at?: string
          first_consultation_information?: string | null
          id?: string
          late_policy?: string | null
          required_documents?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinic_administrative_policies_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: true
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      clinic_locations: {
        Row: {
          accessibility_information: string | null
          active: boolean
          address_line: string | null
          city: string | null
          clinic_id: string
          created_at: string
          id: string
          hide_closed_days: boolean
          is_primary: boolean
          limit_calendar_to_operating_hours: boolean
          name: string
          opening_hours: Json | null
          parking_information: string | null
          phone: string | null
          state: string | null
          timezone: string
          updated_at: string
          zip_code: string | null
        }
        Insert: {
          accessibility_information?: string | null
          active?: boolean
          address_line?: string | null
          city?: string | null
          clinic_id: string
          created_at?: string
          id?: string
          hide_closed_days?: boolean
          is_primary?: boolean
          limit_calendar_to_operating_hours?: boolean
          name: string
          opening_hours?: Json | null
          parking_information?: string | null
          phone?: string | null
          state?: string | null
          timezone?: string
          updated_at?: string
          zip_code?: string | null
        }
        Update: {
          accessibility_information?: string | null
          active?: boolean
          address_line?: string | null
          city?: string | null
          clinic_id?: string
          created_at?: string
          id?: string
          hide_closed_days?: boolean
          is_primary?: boolean
          limit_calendar_to_operating_hours?: boolean
          name?: string
          opening_hours?: Json | null
          parking_information?: string | null
          phone?: string | null
          state?: string | null
          timezone?: string
          updated_at?: string
          zip_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clinic_locations_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      clinic_settings: {
        Row: {
          clinic_id: string
          created_at: string | null
          id: string
          key: string
          value: string
        }
        Insert: {
          clinic_id: string
          created_at?: string | null
          id?: string
          key: string
          value: string
        }
        Update: {
          clinic_id?: string
          created_at?: string | null
          id?: string
          key?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinic_settings_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      clinics: {
        Row: {
          accent_color: string | null
          administrative_manager_name: string | null
          address: string | null
          city: string | null
          created_at: string
          custom_domain: string | null
          email: string | null
          id: string
          is_active: boolean
          logo_url: string | null
          name: string
          phone: string | null
          plan_name: string
          primary_color: string | null
          reception_contact_name: string | null
          secondary_color: string | null
          slug: string
          state: string | null
          status: string
          support_whatsapp: string | null
          updated_at: string
          white_label_enabled: boolean
          zip_code: string | null
        }
        Insert: {
          accent_color?: string | null
          administrative_manager_name?: string | null
          address?: string | null
          city?: string | null
          created_at?: string
          custom_domain?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name: string
          phone?: string | null
          plan_name?: string
          primary_color?: string | null
          reception_contact_name?: string | null
          secondary_color?: string | null
          slug: string
          state?: string | null
          status?: string
          support_whatsapp?: string | null
          updated_at?: string
          white_label_enabled?: boolean
          zip_code?: string | null
        }
        Update: {
          accent_color?: string | null
          administrative_manager_name?: string | null
          address?: string | null
          city?: string | null
          created_at?: string
          custom_domain?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name?: string
          phone?: string | null
          plan_name?: string
          primary_color?: string | null
          reception_contact_name?: string | null
          secondary_color?: string | null
          slug?: string
          state?: string | null
          status?: string
          support_whatsapp?: string | null
          updated_at?: string
          white_label_enabled?: boolean
          zip_code?: string | null
        }
        Relationships: []
      }
      contract_installments: {
        Row: {
          amount: number
          clinic_id: string
          contract_id: string
          created_at: string
          due_date: string
          id: string
          installment_number: number
          installments_count: number
          notes: string | null
          payment_method: string
          payment_method_id: string | null
          payment_plan_id: string
          status: string
          updated_at: string
        }
        Insert: {
          amount?: number
          clinic_id: string
          contract_id: string
          created_at?: string
          due_date: string
          id?: string
          installment_number: number
          installments_count: number
          notes?: string | null
          payment_method: string
          payment_method_id?: string | null
          payment_plan_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          clinic_id?: string
          contract_id?: string
          created_at?: string
          due_date?: string
          id?: string
          installment_number?: number
          installments_count?: number
          notes?: string | null
          payment_method?: string
          payment_method_id?: string | null
          payment_plan_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_installments_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_installments_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_installments_payment_method_id_fkey"
            columns: ["payment_method_id"]
            isOneToOne: false
            referencedRelation: "contract_payment_methods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_installments_payment_plan_id_fkey"
            columns: ["payment_plan_id"]
            isOneToOne: false
            referencedRelation: "contract_payment_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_payment_methods: {
        Row: {
          amount: number
          card_brand: string | null
          card_last_digits: string | null
          clinic_id: string
          contract_id: string
          created_at: string
          id: string
          installment_value: number | null
          installments_count: number
          notes: string | null
          payment_method: string
          payment_plan_id: string
          updated_at: string
        }
        Insert: {
          amount?: number
          card_brand?: string | null
          card_last_digits?: string | null
          clinic_id: string
          contract_id: string
          created_at?: string
          id?: string
          installment_value?: number | null
          installments_count?: number
          notes?: string | null
          payment_method: string
          payment_plan_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          card_brand?: string | null
          card_last_digits?: string | null
          clinic_id?: string
          contract_id?: string
          created_at?: string
          id?: string
          installment_value?: number | null
          installments_count?: number
          notes?: string | null
          payment_method?: string
          payment_plan_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_payment_methods_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_payment_methods_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_payment_methods_payment_plan_id_fkey"
            columns: ["payment_plan_id"]
            isOneToOne: false
            referencedRelation: "contract_payment_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_payment_plans: {
        Row: {
          clinic_id: string
          contract_id: string
          created_at: string
          created_by: string | null
          id: string
          patient_id: string | null
          payer_id: string | null
          prediction_status: string
          proposal_id: string | null
          source: string
          total_contract_value: number
          total_predicted_value: number
          updated_at: string
        }
        Insert: {
          clinic_id: string
          contract_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          patient_id?: string | null
          payer_id?: string | null
          prediction_status?: string
          proposal_id?: string | null
          source?: string
          total_contract_value?: number
          total_predicted_value?: number
          updated_at?: string
        }
        Update: {
          clinic_id?: string
          contract_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          patient_id?: string | null
          payer_id?: string | null
          prediction_status?: string
          proposal_id?: string | null
          source?: string
          total_contract_value?: number
          total_predicted_value?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_payment_plans_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_payment_plans_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: true
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_payment_plans_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_payment_plans_payer_id_fkey"
            columns: ["payer_id"]
            isOneToOne: false
            referencedRelation: "payers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_payment_plans_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      contracts: {
        Row: {
          approved_at: string | null
          clinic_id: string
          confirmation_deadline: string | null
          confirmed_at: string | null
          contract_number: string
          created_at: string
          created_by: string | null
          end_date: string | null
          id: string
          notes: string | null
          patient_id: string
          patient_signature_url: string | null
          payer_id: string | null
          process_status: string
          proposal_id: string | null
          signed_at: string | null
          signed_pdf_url: string | null
          start_date: string | null
          status: Database["public"]["Enums"]["contract_status"]
          template_html: string | null
          updated_at: string
          upload_confirmed: boolean
        }
        Insert: {
          approved_at?: string | null
          clinic_id: string
          confirmation_deadline?: string | null
          confirmed_at?: string | null
          contract_number: string
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          id?: string
          notes?: string | null
          patient_id: string
          patient_signature_url?: string | null
          payer_id?: string | null
          process_status?: string
          proposal_id?: string | null
          signed_at?: string | null
          signed_pdf_url?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["contract_status"]
          template_html?: string | null
          updated_at?: string
          upload_confirmed?: boolean
        }
        Update: {
          approved_at?: string | null
          clinic_id?: string
          confirmation_deadline?: string | null
          confirmed_at?: string | null
          contract_number?: string
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          id?: string
          notes?: string | null
          patient_id?: string
          patient_signature_url?: string | null
          payer_id?: string | null
          process_status?: string
          proposal_id?: string | null
          signed_at?: string | null
          signed_pdf_url?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["contract_status"]
          template_html?: string | null
          updated_at?: string
          upload_confirmed?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "contracts_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_payer_id_fkey"
            columns: ["payer_id"]
            isOneToOne: false
            referencedRelation: "payers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      cost_items: {
        Row: {
          clinic_id: string
          created_at: string | null
          id: string
          name: string
          status: string | null
          type: string
          unit: string | null
          unit_cost: number
        }
        Insert: {
          clinic_id: string
          created_at?: string | null
          id?: string
          name: string
          status?: string | null
          type: string
          unit?: string | null
          unit_cost?: number
        }
        Update: {
          clinic_id?: string
          created_at?: string | null
          id?: string
          name?: string
          status?: string | null
          type?: string
          unit?: string | null
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "cost_items_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          clinic_id: string
          created_at: string
          document_type: string
          file_size: number | null
          file_url: string
          id: string
          mime_type: string | null
          patient_id: string | null
          title: string
          uploaded_by: string | null
        }
        Insert: {
          clinic_id: string
          created_at?: string
          document_type: string
          file_size?: number | null
          file_url: string
          id?: string
          mime_type?: string | null
          patient_id?: string | null
          title: string
          uploaded_by?: string | null
        }
        Update: {
          clinic_id?: string
          created_at?: string
          document_type?: string
          file_size?: number | null
          file_url?: string
          id?: string
          mime_type?: string | null
          patient_id?: string | null
          title?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      health_insurances: {
        Row: {
          ans_code: string | null
          authorization_notes: string | null
          clinic_id: string
          created_at: string
          email: string | null
          id: string
          name: string
          phone: string | null
          status: string
          updated_at: string
        }
        Insert: {
          ans_code?: string | null
          authorization_notes?: string | null
          clinic_id: string
          created_at?: string
          email?: string | null
          id?: string
          name: string
          phone?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          ans_code?: string | null
          authorization_notes?: string | null
          clinic_id?: string
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "health_insurances_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_interactions: {
        Row: {
          clinic_id: string
          created_at: string
          id: string
          lead_id: string
          notes: string | null
          performed_at: string
          performed_by: string | null
          type: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          id?: string
          lead_id: string
          notes?: string | null
          performed_at?: string
          performed_by?: string | null
          type: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          id?: string
          lead_id?: string
          notes?: string | null
          performed_at?: string
          performed_by?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_interactions_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_interactions_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_stage_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          clinic_id: string
          from_stage: string | null
          id: string
          lead_id: string
          notes: string | null
          to_stage: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          clinic_id: string
          from_stage?: string | null
          id?: string
          lead_id: string
          notes?: string | null
          to_stage: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          clinic_id?: string
          from_stage?: string | null
          id?: string
          lead_id?: string
          notes?: string | null
          to_stage?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_stage_history_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_stage_history_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          address: string | null
          appointment_id: string | null
          assigned_to: string | null
          birth_date: string | null
          city: string | null
          clinic_id: string
          converted_at: string | null
          cpf: string | null
          created_at: string
          created_by: string | null
          credit_consent: boolean
          credit_consent_at: string | null
          deleted_at: string | null
          email: string | null
          full_name: string
          id: string
          kanban_stage: string
          last_boleto_eligible: boolean | null
          last_credit_check_at: string | null
          last_credit_risk_level: string | null
          last_interaction_at: string | null
          last_recommended_payment: string | null
          lost_reason: string | null
          lost_reason_notes: string | null
          next_action: string | null
          next_action_at: string | null
          notes: string | null
          patient_id: string | null
          phone: string | null
          priority_level: string
          proposal_id: string | null
          source: string | null
          stage_changed_at: string
          state: string | null
          treatments_of_interest: string[] | null
          updated_at: string
          zip_code: string | null
        }
        Insert: {
          address?: string | null
          appointment_id?: string | null
          assigned_to?: string | null
          birth_date?: string | null
          city?: string | null
          clinic_id: string
          converted_at?: string | null
          cpf?: string | null
          created_at?: string
          created_by?: string | null
          credit_consent?: boolean
          credit_consent_at?: string | null
          deleted_at?: string | null
          email?: string | null
          full_name: string
          id?: string
          kanban_stage?: string
          last_boleto_eligible?: boolean | null
          last_credit_check_at?: string | null
          last_credit_risk_level?: string | null
          last_interaction_at?: string | null
          last_recommended_payment?: string | null
          lost_reason?: string | null
          lost_reason_notes?: string | null
          next_action?: string | null
          next_action_at?: string | null
          notes?: string | null
          patient_id?: string | null
          phone?: string | null
          priority_level?: string
          proposal_id?: string | null
          source?: string | null
          stage_changed_at?: string
          state?: string | null
          treatments_of_interest?: string[] | null
          updated_at?: string
          zip_code?: string | null
        }
        Update: {
          address?: string | null
          appointment_id?: string | null
          assigned_to?: string | null
          birth_date?: string | null
          city?: string | null
          clinic_id?: string
          converted_at?: string | null
          cpf?: string | null
          created_at?: string
          created_by?: string | null
          credit_consent?: boolean
          credit_consent_at?: string | null
          deleted_at?: string | null
          email?: string | null
          full_name?: string
          id?: string
          kanban_stage?: string
          last_boleto_eligible?: boolean | null
          last_credit_check_at?: string | null
          last_credit_risk_level?: string | null
          last_interaction_at?: string | null
          last_recommended_payment?: string | null
          lost_reason?: string | null
          lost_reason_notes?: string | null
          next_action?: string | null
          next_action_at?: string | null
          notes?: string | null
          patient_id?: string | null
          phone?: string | null
          priority_level?: string
          proposal_id?: string | null
          source?: string | null
          stage_changed_at?: string
          state?: string | null
          treatments_of_interest?: string[] | null
          updated_at?: string
          zip_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          channel: string
          clinic_id: string
          created_at: string
          id: string
          message: string | null
          patient_id: string | null
          read_at: string | null
          sent_at: string | null
          status: string
          title: string
          user_id: string | null
        }
        Insert: {
          channel?: string
          clinic_id: string
          created_at?: string
          id?: string
          message?: string | null
          patient_id?: string | null
          read_at?: string | null
          sent_at?: string | null
          status?: string
          title: string
          user_id?: string | null
        }
        Update: {
          channel?: string
          clinic_id?: string
          created_at?: string
          id?: string
          message?: string | null
          patient_id?: string | null
          read_at?: string | null
          sent_at?: string | null
          status?: string
          title?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      nps_responses: {
        Row: {
          appointment_id: string | null
          classification: string | null
          clinic_id: string
          comment: string | null
          created_at: string | null
          id: string
          patient_id: string
          professional_user_id: string | null
          score: number
          submitted_at: string | null
          treatment_id: string | null
        }
        Insert: {
          appointment_id?: string | null
          classification?: string | null
          clinic_id: string
          comment?: string | null
          created_at?: string | null
          id?: string
          patient_id: string
          professional_user_id?: string | null
          score: number
          submitted_at?: string | null
          treatment_id?: string | null
        }
        Update: {
          appointment_id?: string | null
          classification?: string | null
          clinic_id?: string
          comment?: string | null
          created_at?: string | null
          id?: string
          patient_id?: string
          professional_user_id?: string | null
          score?: number
          submitted_at?: string | null
          treatment_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nps_responses_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nps_responses_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nps_responses_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nps_responses_treatment_id_fkey"
            columns: ["treatment_id"]
            isOneToOne: false
            referencedRelation: "treatments"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_anamneses: {
        Row: {
          anamnese_number: string
          archived_at: string | null
          cancelled_at: string | null
          clinic_id: string
          created_at: string | null
          created_by: string | null
          description: string | null
          document_mime_type: string | null
          document_name: string | null
          document_uploaded_at: string | null
          document_url: string | null
          expires_at: string | null
          file_url: string | null
          filled_at: string | null
          form_data: Json | null
          id: string
          is_current: boolean
          notes: string | null
          patient_id: string
          source_type: string
          status: string
          title: string | null
          updated_at: string
          updated_by: string | null
          uploaded_at: string | null
          uploaded_by: string | null
          valid_until: string | null
          validated_at: string | null
          validated_by: string | null
          validity_days: number
        }
        Insert: {
          anamnese_number: string
          archived_at?: string | null
          cancelled_at?: string | null
          clinic_id: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          document_mime_type?: string | null
          document_name?: string | null
          document_uploaded_at?: string | null
          document_url?: string | null
          expires_at?: string | null
          file_url?: string | null
          filled_at?: string | null
          form_data?: Json | null
          id?: string
          is_current?: boolean
          notes?: string | null
          patient_id: string
          source_type?: string
          status?: string
          title?: string | null
          updated_at?: string
          updated_by?: string | null
          uploaded_at?: string | null
          uploaded_by?: string | null
          valid_until?: string | null
          validated_at?: string | null
          validated_by?: string | null
          validity_days?: number
        }
        Update: {
          anamnese_number?: string
          archived_at?: string | null
          cancelled_at?: string | null
          clinic_id?: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          document_mime_type?: string | null
          document_name?: string | null
          document_uploaded_at?: string | null
          document_url?: string | null
          expires_at?: string | null
          file_url?: string | null
          filled_at?: string | null
          form_data?: Json | null
          id?: string
          is_current?: boolean
          notes?: string | null
          patient_id?: string
          source_type?: string
          status?: string
          title?: string | null
          updated_at?: string
          updated_by?: string | null
          uploaded_at?: string | null
          uploaded_by?: string | null
          valid_until?: string | null
          validated_at?: string | null
          validated_by?: string | null
          validity_days?: number
        }
        Relationships: [
          {
            foreignKeyName: "patient_anamneses_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_anamneses_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_metrics: {
        Row: {
          clinic_id: string
          created_at: string
          id: string
          metric_type: string
          notes: string | null
          patient_id: string
          recorded_at: string
          recorded_by: string | null
          unit: string
          value: number
        }
        Insert: {
          clinic_id: string
          created_at?: string
          id?: string
          metric_type: string
          notes?: string | null
          patient_id: string
          recorded_at?: string
          recorded_by?: string | null
          unit?: string
          value: number
        }
        Update: {
          clinic_id?: string
          created_at?: string
          id?: string
          metric_type?: string
          notes?: string | null
          patient_id?: string
          recorded_at?: string
          recorded_by?: string | null
          unit?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "patient_metrics_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_metrics_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_photos: {
        Row: {
          clinic_id: string
          created_at: string
          description: string | null
          id: string
          patient_id: string
          photo_type: Database["public"]["Enums"]["photo_type"]
          photo_url: string
          session_record_id: string | null
          taken_at: string
          thumbnail_url: string | null
          treatment_id: string | null
          uploaded_by: string | null
        }
        Insert: {
          clinic_id: string
          created_at?: string
          description?: string | null
          id?: string
          patient_id: string
          photo_type?: Database["public"]["Enums"]["photo_type"]
          photo_url: string
          session_record_id?: string | null
          taken_at?: string
          thumbnail_url?: string | null
          treatment_id?: string | null
          uploaded_by?: string | null
        }
        Update: {
          clinic_id?: string
          created_at?: string
          description?: string | null
          id?: string
          patient_id?: string
          photo_type?: Database["public"]["Enums"]["photo_type"]
          photo_url?: string
          session_record_id?: string | null
          taken_at?: string
          thumbnail_url?: string | null
          treatment_id?: string | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patient_photos_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_photos_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_photos_session_record_id_fkey"
            columns: ["session_record_id"]
            isOneToOne: false
            referencedRelation: "session_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_photos_treatment_id_fkey"
            columns: ["treatment_id"]
            isOneToOne: false
            referencedRelation: "treatments"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_portal_access: {
        Row: {
          access_status: string
          auth_user_id: string | null
          clinic_id: string
          created_at: string
          id: string
          last_login_at: string | null
          patient_id: string
          updated_at: string
        }
        Insert: {
          access_status?: string
          auth_user_id?: string | null
          clinic_id: string
          created_at?: string
          id?: string
          last_login_at?: string | null
          patient_id: string
          updated_at?: string
        }
        Update: {
          access_status?: string
          auth_user_id?: string | null
          clinic_id?: string
          created_at?: string
          id?: string
          last_login_at?: string | null
          patient_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_portal_access_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_portal_access_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_users: {
        Row: {
          auth_user_id: string
          clinic_id: string
          created_at: string
          id: string
          patient_id: string
          status: string
          updated_at: string
        }
        Insert: {
          auth_user_id: string
          clinic_id: string
          created_at?: string
          id?: string
          patient_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          auth_user_id?: string
          clinic_id?: string
          created_at?: string
          id?: string
          patient_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_users_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_users_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patients: {
        Row: {
          address: string | null
          avatar_url: string | null
          city: string | null
          clinic_id: string
          cpf: string | null
          created_at: string
          current_anamnese_expires_at: string | null
          current_anamnese_id: string | null
          current_anamnese_status: string | null
          date_of_birth: string | null
          dissatisfaction_flag: boolean
          dissatisfaction_level: string | null
          dissatisfaction_reason: string | null
          email: string | null
          full_name: string
          gender: string | null
          has_valid_anamnese: boolean
          id: string
          is_self_payer: boolean
          notes: string | null
          payer_id: string | null
          phone: string | null
          state: string | null
          status: Database["public"]["Enums"]["patient_status"]
          updated_at: string
          user_id: string | null
          zip_code: string | null
        }
        Insert: {
          address?: string | null
          avatar_url?: string | null
          city?: string | null
          clinic_id: string
          cpf?: string | null
          created_at?: string
          current_anamnese_expires_at?: string | null
          current_anamnese_id?: string | null
          current_anamnese_status?: string | null
          date_of_birth?: string | null
          dissatisfaction_flag?: boolean
          dissatisfaction_level?: string | null
          dissatisfaction_reason?: string | null
          email?: string | null
          full_name: string
          gender?: string | null
          has_valid_anamnese?: boolean
          id?: string
          is_self_payer?: boolean
          notes?: string | null
          payer_id?: string | null
          phone?: string | null
          state?: string | null
          status?: Database["public"]["Enums"]["patient_status"]
          updated_at?: string
          user_id?: string | null
          zip_code?: string | null
        }
        Update: {
          address?: string | null
          avatar_url?: string | null
          city?: string | null
          clinic_id?: string
          cpf?: string | null
          created_at?: string
          current_anamnese_expires_at?: string | null
          current_anamnese_id?: string | null
          current_anamnese_status?: string | null
          date_of_birth?: string | null
          dissatisfaction_flag?: boolean
          dissatisfaction_level?: string | null
          dissatisfaction_reason?: string | null
          email?: string | null
          full_name?: string
          gender?: string | null
          has_valid_anamnese?: boolean
          id?: string
          is_self_payer?: boolean
          notes?: string | null
          payer_id?: string | null
          phone?: string | null
          state?: string | null
          status?: Database["public"]["Enums"]["patient_status"]
          updated_at?: string
          user_id?: string | null
          zip_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patients_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patients_payer_id_fkey"
            columns: ["payer_id"]
            isOneToOne: false
            referencedRelation: "payers"
            referencedColumns: ["id"]
          },
        ]
      }
      payers: {
        Row: {
          birth_date: string | null
          clinic_id: string
          cpf: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          birth_date?: string | null
          clinic_id: string
          cpf?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          birth_date?: string | null
          clinic_id?: string
          cpf?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payers_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_installments: {
        Row: {
          amount: number
          created_at: string
          due_date: string
          id: string
          installment_number: number
          paid_date: string | null
          payment_plan_id: string
          status: Database["public"]["Enums"]["payment_status"]
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          due_date: string
          id?: string
          installment_number: number
          paid_date?: string | null
          payment_plan_id: string
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          due_date?: string
          id?: string
          installment_number?: number
          paid_date?: string | null
          payment_plan_id?: string
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_installments_payment_plan_id_fkey"
            columns: ["payment_plan_id"]
            isOneToOne: false
            referencedRelation: "payment_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_plans: {
        Row: {
          clinic_id: string
          contract_id: string
          created_at: string
          id: string
          notes: string | null
          num_installments: number
          patient_id: string
          payment_method: Database["public"]["Enums"]["payment_method"]
          status: Database["public"]["Enums"]["payment_status"]
          total_amount: number
          updated_at: string
        }
        Insert: {
          clinic_id: string
          contract_id: string
          created_at?: string
          id?: string
          notes?: string | null
          num_installments?: number
          patient_id: string
          payment_method?: Database["public"]["Enums"]["payment_method"]
          status?: Database["public"]["Enums"]["payment_status"]
          total_amount: number
          updated_at?: string
        }
        Update: {
          clinic_id?: string
          contract_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          num_installments?: number
          patient_id?: string
          payment_method?: Database["public"]["Enums"]["payment_method"]
          status?: Database["public"]["Enums"]["payment_status"]
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_plans_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_plans_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_plans_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      professional_availability: {
        Row: {
          clinic_id: string
          created_at: string
          day_of_week: number
          end_time: string
          id: string
          is_active: boolean
          location_id: string | null
          professional_id: string
          start_time: string
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          clinic_id: string
          created_at?: string
          day_of_week: number
          end_time: string
          id?: string
          is_active?: boolean
          location_id?: string | null
          professional_id: string
          start_time: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          clinic_id?: string
          created_at?: string
          day_of_week?: number
          end_time?: string
          id?: string
          is_active?: boolean
          location_id?: string | null
          professional_id?: string
          start_time?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "professional_availability_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "professional_availability_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "clinic_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "professional_availability_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      professional_health_insurances: {
        Row: {
          accepts_new_patients: boolean
          ai_instructions: string | null
          appointment_duration_minutes: number
          authorization_required: boolean
          clinic_id: string
          created_at: string
          health_insurance_id: string
          id: string
          notes: string | null
          professional_id: string
          status: string
          updated_at: string
        }
        Insert: {
          accepts_new_patients?: boolean
          ai_instructions?: string | null
          appointment_duration_minutes?: number
          authorization_required?: boolean
          clinic_id: string
          created_at?: string
          health_insurance_id: string
          id?: string
          notes?: string | null
          professional_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          accepts_new_patients?: boolean
          ai_instructions?: string | null
          appointment_duration_minutes?: number
          authorization_required?: boolean
          clinic_id?: string
          created_at?: string
          health_insurance_id?: string
          id?: string
          notes?: string | null
          professional_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "professional_health_insurances_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "professional_health_insurances_insurance_clinic_fkey"
            columns: ["health_insurance_id", "clinic_id"]
            isOneToOne: false
            referencedRelation: "health_insurances"
            referencedColumns: ["id", "clinic_id"]
          },
          {
            foreignKeyName: "professional_health_insurances_professional_clinic_fkey"
            columns: ["professional_id", "clinic_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id", "clinic_id"]
          },
        ]
      }
      professional_locations: {
        Row: {
          active: boolean
          clinic_id: string
          created_at: string
          id: string
          location_id: string
          professional_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          clinic_id: string
          created_at?: string
          id?: string
          location_id: string
          professional_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          clinic_id?: string
          created_at?: string
          id?: string
          location_id?: string
          professional_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "professional_locations_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "professional_locations_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "clinic_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "professional_locations_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      professional_settings: {
        Row: {
          accept_new_patients: boolean
          allow_ai_booking: boolean
          allow_ai_cancellation: boolean
          allow_ai_rescheduling: boolean
          allow_waitlist: boolean
          cancellation_notice_hours: number
          clinic_id: string
          created_at: string
          default_appointment_duration_minutes: number
          id: string
          maximum_booking_days: number
          minimum_booking_notice_hours: number
          private_appointment_duration_minutes: number
          professional_id: string
          updated_at: string
        }
        Insert: {
          accept_new_patients?: boolean
          allow_ai_booking?: boolean
          allow_ai_cancellation?: boolean
          allow_ai_rescheduling?: boolean
          allow_waitlist?: boolean
          cancellation_notice_hours?: number
          clinic_id: string
          created_at?: string
          default_appointment_duration_minutes?: number
          id?: string
          maximum_booking_days?: number
          minimum_booking_notice_hours?: number
          private_appointment_duration_minutes?: number
          professional_id: string
          updated_at?: string
        }
        Update: {
          accept_new_patients?: boolean
          allow_ai_booking?: boolean
          allow_ai_cancellation?: boolean
          allow_ai_rescheduling?: boolean
          allow_waitlist?: boolean
          cancellation_notice_hours?: number
          clinic_id?: string
          created_at?: string
          default_appointment_duration_minutes?: number
          id?: string
          maximum_booking_days?: number
          minimum_booking_notice_hours?: number
          private_appointment_duration_minutes?: number
          professional_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "professional_settings_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "professional_settings_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: true
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      professional_treatments: {
        Row: {
          can_ai_schedule: boolean | null
          clinic_id: string
          created_at: string
          duration_minutes: number | null
          id: string
          private_price: number | null
          professional_id: string
          requires_previous_evaluation: boolean | null
          show_price: boolean | null
          status: string
          treatment_id: string
          updated_at: string
        }
        Insert: {
          can_ai_schedule?: boolean | null
          clinic_id: string
          created_at?: string
          duration_minutes?: number | null
          id?: string
          private_price?: number | null
          professional_id: string
          requires_previous_evaluation?: boolean | null
          show_price?: boolean | null
          status?: string
          treatment_id: string
          updated_at?: string
        }
        Update: {
          can_ai_schedule?: boolean | null
          clinic_id?: string
          created_at?: string
          duration_minutes?: number | null
          id?: string
          private_price?: number | null
          professional_id?: string
          requires_previous_evaluation?: boolean | null
          show_price?: boolean | null
          status?: string
          treatment_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "professional_treatments_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "professional_treatments_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "professional_treatments_treatment_id_fkey"
            columns: ["treatment_id"]
            isOneToOne: false
            referencedRelation: "treatments"
            referencedColumns: ["id"]
          },
        ]
      }
      professionals: {
        Row: {
          additional_phones: string[]
          class_entity_id: string | null
          clinic_id: string
          cpf: string | null
          created_at: string
          email: string | null
          full_name: string
          id: string
          phone: string | null
          private_consultation_price: number | null
          registration_number: string | null
          role_id: string | null
          specialty: string | null
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          additional_phones?: string[]
          class_entity_id?: string | null
          clinic_id: string
          cpf?: string | null
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          phone?: string | null
          private_consultation_price?: number | null
          registration_number?: string | null
          role_id?: string | null
          specialty?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          additional_phones?: string[]
          class_entity_id?: string | null
          clinic_id?: string
          cpf?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          phone?: string | null
          private_consultation_price?: number | null
          registration_number?: string | null
          role_id?: string | null
          specialty?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "professionals_class_entity_id_fkey"
            columns: ["class_entity_id"]
            isOneToOne: false
            referencedRelation: "class_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "professionals_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "professionals_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_items: {
        Row: {
          created_at: string
          id: string
          proposal_id: string
          quantity: number
          subtotal: number
          treatment_id: string
          unit_price: number
        }
        Insert: {
          created_at?: string
          id?: string
          proposal_id: string
          quantity?: number
          subtotal: number
          treatment_id: string
          unit_price: number
        }
        Update: {
          created_at?: string
          id?: string
          proposal_id?: string
          quantity?: number
          subtotal?: number
          treatment_id?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "proposal_items_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_items_treatment_id_fkey"
            columns: ["treatment_id"]
            isOneToOne: false
            referencedRelation: "treatments"
            referencedColumns: ["id"]
          },
        ]
      }
      proposals: {
        Row: {
          clinic_id: string
          created_at: string
          created_by: string | null
          discount_amount: number | null
          discount_percent: number | null
          final_amount: number
          id: string
          notes: string | null
          patient_id: string
          proposal_number: string
          status: Database["public"]["Enums"]["proposal_status"]
          total_amount: number
          updated_at: string
          valid_until: string | null
        }
        Insert: {
          clinic_id: string
          created_at?: string
          created_by?: string | null
          discount_amount?: number | null
          discount_percent?: number | null
          final_amount?: number
          id?: string
          notes?: string | null
          patient_id: string
          proposal_number: string
          status?: Database["public"]["Enums"]["proposal_status"]
          total_amount?: number
          updated_at?: string
          valid_until?: string | null
        }
        Update: {
          clinic_id?: string
          created_at?: string
          created_by?: string | null
          discount_amount?: number | null
          discount_percent?: number | null
          final_amount?: number
          id?: string
          notes?: string | null
          patient_id?: string
          proposal_number?: string
          status?: Database["public"]["Enums"]["proposal_status"]
          total_amount?: number
          updated_at?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "proposals_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposals_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      renewal_interactions: {
        Row: {
          clinic_id: string
          created_at: string
          id: string
          notes: string | null
          patient_id: string
          performed_at: string
          performed_by: string | null
          renewal_task_id: string
          type: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          id?: string
          notes?: string | null
          patient_id: string
          performed_at?: string
          performed_by?: string | null
          renewal_task_id: string
          type: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          patient_id?: string
          performed_at?: string
          performed_by?: string | null
          renewal_task_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "renewal_interactions_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "renewal_interactions_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "renewal_interactions_renewal_task_id_fkey"
            columns: ["renewal_task_id"]
            isOneToOne: false
            referencedRelation: "renewal_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "renewal_interactions_renewal_task_id_fkey"
            columns: ["renewal_task_id"]
            isOneToOne: false
            referencedRelation: "v_renewal_tasks_active"
            referencedColumns: ["id"]
          },
        ]
      }
      renewal_tasks: {
        Row: {
          assigned_to: string | null
          clinic_id: string
          contract_id: string | null
          contract_item_id: string | null
          converted_proposal_id: string | null
          created_at: string
          discarded_reason: string | null
          discarded_reason_notes: string | null
          id: string
          last_action_at: string | null
          last_action_type: string | null
          patient_id: string
          scheduled_for: string | null
          sessions_completed: number | null
          sessions_total: number | null
          sla_red_at: string | null
          sla_yellow_at: string | null
          snooze_count: number
          snoozed_until: string | null
          status: string
          suggested_treatment_id: string | null
          suggested_treatment_rule: string | null
          suggestion_context: Json
          treatment_id: string
          trigger_session_id: string | null
          trigger_type: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          clinic_id: string
          contract_id?: string | null
          contract_item_id?: string | null
          converted_proposal_id?: string | null
          created_at?: string
          discarded_reason?: string | null
          discarded_reason_notes?: string | null
          id?: string
          last_action_at?: string | null
          last_action_type?: string | null
          patient_id: string
          scheduled_for?: string | null
          sessions_completed?: number | null
          sessions_total?: number | null
          sla_red_at?: string | null
          sla_yellow_at?: string | null
          snooze_count?: number
          snoozed_until?: string | null
          status?: string
          suggested_treatment_id?: string | null
          suggested_treatment_rule?: string | null
          suggestion_context?: Json
          treatment_id: string
          trigger_session_id?: string | null
          trigger_type: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          clinic_id?: string
          contract_id?: string | null
          contract_item_id?: string | null
          converted_proposal_id?: string | null
          created_at?: string
          discarded_reason?: string | null
          discarded_reason_notes?: string | null
          id?: string
          last_action_at?: string | null
          last_action_type?: string | null
          patient_id?: string
          scheduled_for?: string | null
          sessions_completed?: number | null
          sessions_total?: number | null
          sla_red_at?: string | null
          sla_yellow_at?: string | null
          snooze_count?: number
          snoozed_until?: string | null
          status?: string
          suggested_treatment_id?: string | null
          suggested_treatment_rule?: string | null
          suggestion_context?: Json
          treatment_id?: string
          trigger_session_id?: string | null
          trigger_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "renewal_tasks_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "renewal_tasks_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "renewal_tasks_converted_proposal_id_fkey"
            columns: ["converted_proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "renewal_tasks_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "renewal_tasks_suggested_treatment_id_fkey"
            columns: ["suggested_treatment_id"]
            isOneToOne: false
            referencedRelation: "treatments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "renewal_tasks_treatment_id_fkey"
            columns: ["treatment_id"]
            isOneToOne: false
            referencedRelation: "treatments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "renewal_tasks_trigger_session_id_fkey"
            columns: ["trigger_session_id"]
            isOneToOne: false
            referencedRelation: "session_records"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          clinic_id: string
          created_at: string
          description: string | null
          id: string
          name: string
          status: string
          updated_at: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          status?: string
          updated_at?: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "roles_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_goals: {
        Row: {
          category_id: string | null
          clinic_id: string
          created_at: string | null
          created_by: string | null
          goal_amount: number
          goal_name: string | null
          goal_type: string
          id: string
          notes: string | null
          period_end: string | null
          period_reference: string
          period_start: string | null
          period_type: string
          status: string
          team_name: string | null
          treatment_id: string | null
          user_id: string | null
        }
        Insert: {
          category_id?: string | null
          clinic_id: string
          created_at?: string | null
          created_by?: string | null
          goal_amount: number
          goal_name?: string | null
          goal_type?: string
          id?: string
          notes?: string | null
          period_end?: string | null
          period_reference: string
          period_start?: string | null
          period_type: string
          status?: string
          team_name?: string | null
          treatment_id?: string | null
          user_id?: string | null
        }
        Update: {
          category_id?: string | null
          clinic_id?: string
          created_at?: string | null
          created_by?: string | null
          goal_amount?: number
          goal_name?: string | null
          goal_type?: string
          id?: string
          notes?: string | null
          period_end?: string | null
          period_reference?: string
          period_start?: string | null
          period_type?: string
          status?: string
          team_name?: string | null
          treatment_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_goals_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "treatment_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_goals_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_goals_treatment_id_fkey"
            columns: ["treatment_id"]
            isOneToOne: false
            referencedRelation: "treatments"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduling_connection_professionals: {
        Row: {
          clinic_id: string
          connection_id: string
          created_at: string
          id: string
          is_active: boolean
          professional_id: string
          updated_at: string
        }
        Insert: {
          clinic_id: string
          connection_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          professional_id: string
          updated_at?: string
        }
        Update: {
          clinic_id?: string
          connection_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          professional_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduling_connection_professionals_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduling_connection_professionals_connection_clinic_fkey"
            columns: ["connection_id", "clinic_id"]
            isOneToOne: false
            referencedRelation: "scheduling_provider_connections"
            referencedColumns: ["id", "clinic_id"]
          },
          {
            foreignKeyName: "scheduling_connection_professionals_professional_clinic_fkey"
            columns: ["professional_id", "clinic_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id", "clinic_id"]
          },
        ]
      }
      scheduling_insurance_mappings: {
        Row: {
          clinic_id: string
          connection_id: string
          created_at: string
          external_id: string
          external_name: string | null
          external_parent_id: string | null
          health_insurance_id: string
          id: string
          last_verified_at: string | null
          metadata: Json
          status: string
          updated_at: string
        }
        Insert: {
          clinic_id: string
          connection_id: string
          created_at?: string
          external_id: string
          external_name?: string | null
          external_parent_id?: string | null
          health_insurance_id: string
          id?: string
          last_verified_at?: string | null
          metadata?: Json
          status?: string
          updated_at?: string
        }
        Update: {
          clinic_id?: string
          connection_id?: string
          created_at?: string
          external_id?: string
          external_name?: string | null
          external_parent_id?: string | null
          health_insurance_id?: string
          id?: string
          last_verified_at?: string | null
          metadata?: Json
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduling_insurance_mappings_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduling_insurance_mappings_connection_clinic_fkey"
            columns: ["connection_id", "clinic_id"]
            isOneToOne: false
            referencedRelation: "scheduling_provider_connections"
            referencedColumns: ["id", "clinic_id"]
          },
          {
            foreignKeyName: "scheduling_insurance_mappings_insurance_clinic_fkey"
            columns: ["health_insurance_id", "clinic_id"]
            isOneToOne: false
            referencedRelation: "health_insurances"
            referencedColumns: ["id", "clinic_id"]
          },
        ]
      }
      scheduling_location_mappings: {
        Row: {
          clinic_id: string
          connection_id: string
          created_at: string
          external_id: string
          external_name: string | null
          external_parent_id: string | null
          id: string
          last_verified_at: string | null
          location_id: string
          metadata: Json
          status: string
          updated_at: string
        }
        Insert: {
          clinic_id: string
          connection_id: string
          created_at?: string
          external_id: string
          external_name?: string | null
          external_parent_id?: string | null
          id?: string
          last_verified_at?: string | null
          location_id: string
          metadata?: Json
          status?: string
          updated_at?: string
        }
        Update: {
          clinic_id?: string
          connection_id?: string
          created_at?: string
          external_id?: string
          external_name?: string | null
          external_parent_id?: string | null
          id?: string
          last_verified_at?: string | null
          location_id?: string
          metadata?: Json
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduling_location_mappings_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduling_location_mappings_connection_clinic_fkey"
            columns: ["connection_id", "clinic_id"]
            isOneToOne: false
            referencedRelation: "scheduling_provider_connections"
            referencedColumns: ["id", "clinic_id"]
          },
          {
            foreignKeyName: "scheduling_location_mappings_location_clinic_fkey"
            columns: ["location_id", "clinic_id"]
            isOneToOne: false
            referencedRelation: "clinic_locations"
            referencedColumns: ["id", "clinic_id"]
          },
        ]
      }
      scheduling_exceptions: {
        Row: {
          clinic_id: string
          created_at: string
          created_by: string | null
          exception_date: string
          id: string
          is_closed: boolean
          kind: string
          location_id: string
          periods: Json | null
          professional_id: string | null
          reason: string | null
          updated_at: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          created_by?: string | null
          exception_date: string
          id?: string
          is_closed?: boolean
          kind?: string
          location_id: string
          periods?: Json | null
          professional_id?: string | null
          reason?: string | null
          updated_at?: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          created_by?: string | null
          exception_date?: string
          id?: string
          is_closed?: boolean
          kind?: string
          location_id?: string
          periods?: Json | null
          professional_id?: string | null
          reason?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduling_exceptions_location_tenant_fk"
            columns: ["clinic_id", "location_id"]
            isOneToOne: false
            referencedRelation: "clinic_locations"
            referencedColumns: ["clinic_id", "id"]
          },
          {
            foreignKeyName: "scheduling_exceptions_professional_tenant_fk"
            columns: ["professional_id", "clinic_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id", "clinic_id"]
          },
        ]
      }
      scheduling_professional_mappings: {
        Row: {
          clinic_id: string
          connection_id: string
          created_at: string
          external_id: string
          external_name: string | null
          external_parent_id: string | null
          id: string
          last_verified_at: string | null
          metadata: Json
          professional_id: string
          status: string
          updated_at: string
        }
        Insert: {
          clinic_id: string
          connection_id: string
          created_at?: string
          external_id: string
          external_name?: string | null
          external_parent_id?: string | null
          id?: string
          last_verified_at?: string | null
          metadata?: Json
          professional_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          clinic_id?: string
          connection_id?: string
          created_at?: string
          external_id?: string
          external_name?: string | null
          external_parent_id?: string | null
          id?: string
          last_verified_at?: string | null
          metadata?: Json
          professional_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduling_professional_mappings_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduling_professional_mappings_connection_clinic_fkey"
            columns: ["connection_id", "clinic_id"]
            isOneToOne: false
            referencedRelation: "scheduling_provider_connections"
            referencedColumns: ["id", "clinic_id"]
          },
          {
            foreignKeyName: "scheduling_professional_mappings_professional_clinic_fkey"
            columns: ["professional_id", "clinic_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id", "clinic_id"]
          },
        ]
      }
      scheduling_provider_connections: {
        Row: {
          capabilities: Json
          clinic_id: string
          connected_at: string | null
          created_at: string
          disconnected_at: string | null
          display_name: string
          external_account_id: string | null
          external_account_name: string | null
          id: string
          is_default: boolean
          last_verified_at: string | null
          metadata: Json
          provider_type: string
          source_of_truth: string
          status: string
          updated_at: string
        }
        Insert: {
          capabilities?: Json
          clinic_id: string
          connected_at?: string | null
          created_at?: string
          disconnected_at?: string | null
          display_name: string
          external_account_id?: string | null
          external_account_name?: string | null
          id?: string
          is_default?: boolean
          last_verified_at?: string | null
          metadata?: Json
          provider_type: string
          source_of_truth: string
          status?: string
          updated_at?: string
        }
        Update: {
          capabilities?: Json
          clinic_id?: string
          connected_at?: string | null
          created_at?: string
          disconnected_at?: string | null
          display_name?: string
          external_account_id?: string | null
          external_account_name?: string | null
          id?: string
          is_default?: boolean
          last_verified_at?: string | null
          metadata?: Json
          provider_type?: string
          source_of_truth?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduling_provider_connections_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduling_provider_events: {
        Row: {
          clinic_id: string
          connection_id: string
          created_at: string
          error_code: string | null
          error_message: string | null
          event_type: string
          external_appointment_id: string | null
          external_event_id: string | null
          id: string
          payload_hash: string | null
          processed_at: string | null
          processing_status: string
          provider_type: string
          received_at: string
          updated_at: string
        }
        Insert: {
          clinic_id: string
          connection_id: string
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          event_type: string
          external_appointment_id?: string | null
          external_event_id?: string | null
          id?: string
          payload_hash?: string | null
          processed_at?: string | null
          processing_status?: string
          provider_type: string
          received_at?: string
          updated_at?: string
        }
        Update: {
          clinic_id?: string
          connection_id?: string
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          event_type?: string
          external_appointment_id?: string | null
          external_event_id?: string | null
          id?: string
          payload_hash?: string | null
          processed_at?: string | null
          processing_status?: string
          provider_type?: string
          received_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduling_provider_events_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduling_provider_events_connection_clinic_fkey"
            columns: ["connection_id", "clinic_id"]
            isOneToOne: false
            referencedRelation: "scheduling_provider_connections"
            referencedColumns: ["id", "clinic_id"]
          },
        ]
      }
      scheduling_reconciliation_states: {
        Row: {
          checkpoint: string | null
          checkpoint_metadata: Json
          clinic_id: string
          connection_id: string
          consecutive_failures: number
          created_at: string
          last_completed_at: string | null
          last_error_at: string | null
          last_error_code: string | null
          last_error_message: string | null
          last_started_at: string | null
          last_success_at: string | null
          status: string
          sync_token: string | null
          updated_at: string
        }
        Insert: {
          checkpoint?: string | null
          checkpoint_metadata?: Json
          clinic_id: string
          connection_id: string
          consecutive_failures?: number
          created_at?: string
          last_completed_at?: string | null
          last_error_at?: string | null
          last_error_code?: string | null
          last_error_message?: string | null
          last_started_at?: string | null
          last_success_at?: string | null
          status?: string
          sync_token?: string | null
          updated_at?: string
        }
        Update: {
          checkpoint?: string | null
          checkpoint_metadata?: Json
          clinic_id?: string
          connection_id?: string
          consecutive_failures?: number
          created_at?: string
          last_completed_at?: string | null
          last_error_at?: string | null
          last_error_code?: string | null
          last_error_message?: string | null
          last_started_at?: string | null
          last_success_at?: string | null
          status?: string
          sync_token?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduling_reconciliation_states_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduling_reconciliation_states_connection_clinic_fkey"
            columns: ["connection_id", "clinic_id"]
            isOneToOne: false
            referencedRelation: "scheduling_provider_connections"
            referencedColumns: ["id", "clinic_id"]
          },
        ]
      }
      scheduling_service_mappings: {
        Row: {
          clinic_id: string
          connection_id: string
          created_at: string
          external_id: string
          external_name: string | null
          external_parent_id: string | null
          id: string
          last_verified_at: string | null
          metadata: Json
          status: string
          treatment_id: string
          updated_at: string
        }
        Insert: {
          clinic_id: string
          connection_id: string
          created_at?: string
          external_id: string
          external_name?: string | null
          external_parent_id?: string | null
          id?: string
          last_verified_at?: string | null
          metadata?: Json
          status?: string
          treatment_id: string
          updated_at?: string
        }
        Update: {
          clinic_id?: string
          connection_id?: string
          created_at?: string
          external_id?: string
          external_name?: string | null
          external_parent_id?: string | null
          id?: string
          last_verified_at?: string | null
          metadata?: Json
          status?: string
          treatment_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduling_service_mappings_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduling_service_mappings_connection_clinic_fkey"
            columns: ["connection_id", "clinic_id"]
            isOneToOne: false
            referencedRelation: "scheduling_provider_connections"
            referencedColumns: ["id", "clinic_id"]
          },
          {
            foreignKeyName: "scheduling_service_mappings_treatment_id_fkey"
            columns: ["treatment_id"]
            isOneToOne: false
            referencedRelation: "treatments"
            referencedColumns: ["id"]
          },
        ]
      }
      session_feedback: {
        Row: {
          clinic_id: string
          comment: string | null
          created_at: string
          id: string
          is_negative: boolean
          is_responded: boolean
          patient_id: string
          professional_id: string | null
          rating: number
          responded_at: string | null
          responded_by: string | null
          response: string | null
          service_attention: number | null
          session_record_id: string
          treatment_id: string | null
          waiting_time: number | null
        }
        Insert: {
          clinic_id: string
          comment?: string | null
          created_at?: string
          id?: string
          is_negative?: boolean
          is_responded?: boolean
          patient_id: string
          professional_id?: string | null
          rating: number
          responded_at?: string | null
          responded_by?: string | null
          response?: string | null
          service_attention?: number | null
          session_record_id: string
          treatment_id?: string | null
          waiting_time?: number | null
        }
        Update: {
          clinic_id?: string
          comment?: string | null
          created_at?: string
          id?: string
          is_negative?: boolean
          is_responded?: boolean
          patient_id?: string
          professional_id?: string | null
          rating?: number
          responded_at?: string | null
          responded_by?: string | null
          response?: string | null
          service_attention?: number | null
          session_record_id?: string
          treatment_id?: string | null
          waiting_time?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "session_feedback_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_feedback_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_feedback_session_record_id_fkey"
            columns: ["session_record_id"]
            isOneToOne: false
            referencedRelation: "session_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_feedback_treatment_id_fkey"
            columns: ["treatment_id"]
            isOneToOne: false
            referencedRelation: "treatments"
            referencedColumns: ["id"]
          },
        ]
      }
      session_records: {
        Row: {
          appointment_id: string | null
          clinic_id: string
          created_at: string
          id: string
          notes: string | null
          observations: string | null
          patient_id: string
          performed_at: string
          products_used: string | null
          professional_id: string | null
          session_number: number
          total_sessions: number
          treatment_id: string | null
          updated_at: string
        }
        Insert: {
          appointment_id?: string | null
          clinic_id: string
          created_at?: string
          id?: string
          notes?: string | null
          observations?: string | null
          patient_id: string
          performed_at?: string
          products_used?: string | null
          professional_id?: string | null
          session_number?: number
          total_sessions?: number
          treatment_id?: string | null
          updated_at?: string
        }
        Update: {
          appointment_id?: string | null
          clinic_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          observations?: string | null
          patient_id?: string
          performed_at?: string
          products_used?: string | null
          professional_id?: string | null
          session_number?: number
          total_sessions?: number
          treatment_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_records_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_records_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_records_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_records_treatment_id_fkey"
            columns: ["treatment_id"]
            isOneToOne: false
            referencedRelation: "treatments"
            referencedColumns: ["id"]
          },
        ]
      }
      team_invitations: {
        Row: {
          accepted_at: string | null
          cargo_name: string | null
          clinic_id: string
          created_at: string
          email: string
          id: string
          invited_by: string | null
          role: Database["public"]["Enums"]["app_role"]
          status: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          cargo_name?: string | null
          clinic_id: string
          created_at?: string
          email: string
          id?: string
          invited_by?: string | null
          role: Database["public"]["Enums"]["app_role"]
          status?: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          cargo_name?: string | null
          clinic_id?: string
          created_at?: string
          email?: string
          id?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_invitations_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      treatment_categories: {
        Row: {
          clinic_id: string
          created_at: string | null
          description: string | null
          id: string
          name: string
          status: string | null
        }
        Insert: {
          clinic_id: string
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
          status?: string | null
        }
        Update: {
          clinic_id?: string
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "treatment_categories_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      treatment_combo_items: {
        Row: {
          combo_id: string
          created_at: string | null
          id: string
          quantity: number | null
          treatment_id: string
        }
        Insert: {
          combo_id: string
          created_at?: string | null
          id?: string
          quantity?: number | null
          treatment_id: string
        }
        Update: {
          combo_id?: string
          created_at?: string | null
          id?: string
          quantity?: number | null
          treatment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "treatment_combo_items_combo_id_fkey"
            columns: ["combo_id"]
            isOneToOne: false
            referencedRelation: "treatment_combos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treatment_combo_items_treatment_id_fkey"
            columns: ["treatment_id"]
            isOneToOne: false
            referencedRelation: "treatments"
            referencedColumns: ["id"]
          },
        ]
      }
      treatment_combos: {
        Row: {
          active: boolean | null
          clinic_id: string
          created_at: string | null
          id: string
          name: string
          promotional_price: number | null
        }
        Insert: {
          active?: boolean | null
          clinic_id: string
          created_at?: string | null
          id?: string
          name: string
          promotional_price?: number | null
        }
        Update: {
          active?: boolean | null
          clinic_id?: string
          created_at?: string | null
          id?: string
          name?: string
          promotional_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "treatment_combos_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      treatment_cost_items: {
        Row: {
          cost_item_id: string
          created_at: string | null
          id: string
          quantity: number
          treatment_id: string
        }
        Insert: {
          cost_item_id: string
          created_at?: string | null
          id?: string
          quantity?: number
          treatment_id: string
        }
        Update: {
          cost_item_id?: string
          created_at?: string | null
          id?: string
          quantity?: number
          treatment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "treatment_cost_items_cost_item_id_fkey"
            columns: ["cost_item_id"]
            isOneToOne: false
            referencedRelation: "cost_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treatment_cost_items_treatment_id_fkey"
            columns: ["treatment_id"]
            isOneToOne: false
            referencedRelation: "treatments"
            referencedColumns: ["id"]
          },
        ]
      }
      treatments: {
        Row: {
          administrative_instructions: string | null
          can_be_scheduled_by_ai: boolean
          can_be_scheduled_online: boolean
          category: string | null
          category_id: string | null
          clinic_id: string
          cost: number | null
          created_at: string
          default_price: number | null
          description: string | null
          duration_minutes: number
          id: string
          is_active: boolean
          min_price: number | null
          name: string
          num_sessions: number
          preparation_instructions: string | null
          price: number
          renewal_enabled: boolean
          renewal_trigger_days: number
          requires_evaluation: boolean
          show_price_to_ai: boolean
          show_price_to_patient: boolean
          updated_at: string
        }
        Insert: {
          administrative_instructions?: string | null
          can_be_scheduled_by_ai?: boolean
          can_be_scheduled_online?: boolean
          category?: string | null
          category_id?: string | null
          clinic_id: string
          cost?: number | null
          created_at?: string
          default_price?: number | null
          description?: string | null
          duration_minutes?: number
          id?: string
          is_active?: boolean
          min_price?: number | null
          name: string
          num_sessions?: number
          preparation_instructions?: string | null
          price?: number
          renewal_enabled?: boolean
          renewal_trigger_days?: number
          requires_evaluation?: boolean
          show_price_to_ai?: boolean
          show_price_to_patient?: boolean
          updated_at?: string
        }
        Update: {
          administrative_instructions?: string | null
          can_be_scheduled_by_ai?: boolean
          can_be_scheduled_online?: boolean
          category?: string | null
          category_id?: string | null
          clinic_id?: string
          cost?: number | null
          created_at?: string
          default_price?: number | null
          description?: string | null
          duration_minutes?: number
          id?: string
          is_active?: boolean
          min_price?: number | null
          name?: string
          num_sessions?: number
          preparation_instructions?: string | null
          price?: number
          renewal_enabled?: boolean
          renewal_trigger_days?: number
          requires_evaluation?: boolean
          show_price_to_ai?: boolean
          show_price_to_patient?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "treatments_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "treatment_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treatments_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      user_access_groups: {
        Row: {
          clinic_id: string
          created_at: string
          group_id: string
          id: string
          is_active: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          group_id: string
          id?: string
          is_active?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          group_id?: string
          id?: string
          is_active?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_access_groups_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_access_groups_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "access_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          clinic_id: string
          created_at: string
          id: string
          is_active: boolean
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          role: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      waitlist_agent_logs: {
        Row: {
          clinic_id: string
          created_at: string
          entries_checked: number
          errors: Json | null
          finished_at: string | null
          id: string
          matches_found: number
          notifications_sent: number
          started_at: string
          status: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          entries_checked?: number
          errors?: Json | null
          finished_at?: string | null
          id?: string
          matches_found?: number
          notifications_sent?: number
          started_at?: string
          status?: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          entries_checked?: number
          errors?: Json | null
          finished_at?: string | null
          id?: string
          matches_found?: number
          notifications_sent?: number
          started_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "waitlist_agent_logs_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      waitlist_notifications: {
        Row: {
          action_taken: string
          action_taken_at: string | null
          action_taken_by: string | null
          clinic_id: string
          created_at: string
          id: string
          matched_professional_id: string | null
          matched_slot_end: string
          matched_slot_start: string
          notification_sent_at: string
          resulting_appointment_id: string | null
          waitlist_id: string
        }
        Insert: {
          action_taken?: string
          action_taken_at?: string | null
          action_taken_by?: string | null
          clinic_id: string
          created_at?: string
          id?: string
          matched_professional_id?: string | null
          matched_slot_end: string
          matched_slot_start: string
          notification_sent_at?: string
          resulting_appointment_id?: string | null
          waitlist_id: string
        }
        Update: {
          action_taken?: string
          action_taken_at?: string | null
          action_taken_by?: string | null
          clinic_id?: string
          created_at?: string
          id?: string
          matched_professional_id?: string | null
          matched_slot_end?: string
          matched_slot_start?: string
          notification_sent_at?: string
          resulting_appointment_id?: string | null
          waitlist_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "waitlist_notifications_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitlist_notifications_matched_professional_id_fkey"
            columns: ["matched_professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitlist_notifications_resulting_appointment_id_fkey"
            columns: ["resulting_appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitlist_notifications_waitlist_id_fkey"
            columns: ["waitlist_id"]
            isOneToOne: false
            referencedRelation: "appointment_waitlist"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_ai_conversations: {
        Row: {
          active_handoff_id: string | null
          ai_enabled: boolean
          ai_failure_count: number
          assigned_user_id: string | null
          clinic_id: string
          contact_name: string | null
          control_mode: string
          control_revision: number
          conversation_state: Json
          created_at: string
          id: string
          last_inbound_at: string | null
          last_message_at: string | null
          last_outbound_at: string | null
          lead_id: string | null
          metadata: Json
          phone: string
          state_revision: number
          state_updated_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          active_handoff_id?: string | null
          ai_enabled?: boolean
          ai_failure_count?: number
          assigned_user_id?: string | null
          clinic_id: string
          contact_name?: string | null
          control_mode?: string
          control_revision?: number
          conversation_state?: Json
          created_at?: string
          id?: string
          last_inbound_at?: string | null
          last_message_at?: string | null
          last_outbound_at?: string | null
          lead_id?: string | null
          metadata?: Json
          phone: string
          state_revision?: number
          state_updated_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          active_handoff_id?: string | null
          ai_enabled?: boolean
          ai_failure_count?: number
          assigned_user_id?: string | null
          clinic_id?: string
          contact_name?: string | null
          control_mode?: string
          control_revision?: number
          conversation_state?: Json
          created_at?: string
          id?: string
          last_inbound_at?: string | null
          last_message_at?: string | null
          last_outbound_at?: string | null
          lead_id?: string | null
          metadata?: Json
          phone?: string
          state_revision?: number
          state_updated_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_ai_conversations_active_handoff_tenant_fk"
            columns: ["active_handoff_id", "clinic_id"]
            isOneToOne: false
            referencedRelation: "ai_conversation_handoffs"
            referencedColumns: ["id", "clinic_id"]
          },
          {
            foreignKeyName: "whatsapp_ai_conversations_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_ai_conversations_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_ai_messages: {
        Row: {
          actor_user_id: string | null
          ai_model: string | null
          body: string
          clinic_id: string
          completion_tokens: number | null
          conversation_id: string
          created_at: string
          direction: string
          id: string
          lead_id: string | null
          message_origin: string
          prompt_tokens: number | null
          provider_message_id: string | null
          provider_status: string | null
          raw_payload: Json
          role: string
          total_tokens: number | null
        }
        Insert: {
          actor_user_id?: string | null
          ai_model?: string | null
          body: string
          clinic_id: string
          completion_tokens?: number | null
          conversation_id: string
          created_at?: string
          direction: string
          id?: string
          lead_id?: string | null
          message_origin?: string
          prompt_tokens?: number | null
          provider_message_id?: string | null
          provider_status?: string | null
          raw_payload?: Json
          role: string
          total_tokens?: number | null
        }
        Update: {
          actor_user_id?: string | null
          ai_model?: string | null
          body?: string
          clinic_id?: string
          completion_tokens?: number | null
          conversation_id?: string
          created_at?: string
          direction?: string
          id?: string
          lead_id?: string | null
          message_origin?: string
          prompt_tokens?: number | null
          provider_message_id?: string | null
          provider_status?: string | null
          raw_payload?: Json
          role?: string
          total_tokens?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_ai_messages_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_ai_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_ai_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_ai_messages_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_ai_settings: {
        Row: {
          ai_engine_mode: string
          ai_handoff_enabled: boolean
          ai_handoff_validated_at: string | null
          ai_knowledge_enabled: boolean
          ai_knowledge_validated_at: string | null
          ai_mutation_tools_enabled: boolean
          ai_read_tools_enabled: boolean
          ai_read_tools_validated_at: string | null
          clinic_id: string
          created_at: string
          default_goal: string
          display_phone_number: string | null
          handoff_message: string
          id: string
          is_enabled: boolean
          meta_app_secret_configured: boolean
          meta_token_configured: boolean
          openai_key_configured: boolean
          openai_model: string
          phone_number_id_last4: string | null
          preferred_language: string
          response_style: string
          updated_at: string
          webhook_verify_token_configured: boolean
          welcome_message: string | null
        }
        Insert: {
          ai_engine_mode?: string
          ai_handoff_enabled?: boolean
          ai_handoff_validated_at?: string | null
          ai_knowledge_enabled?: boolean
          ai_knowledge_validated_at?: string | null
          ai_mutation_tools_enabled?: boolean
          ai_read_tools_enabled?: boolean
          ai_read_tools_validated_at?: string | null
          clinic_id: string
          created_at?: string
          default_goal?: string
          display_phone_number?: string | null
          handoff_message?: string
          id?: string
          is_enabled?: boolean
          meta_app_secret_configured?: boolean
          meta_token_configured?: boolean
          openai_key_configured?: boolean
          openai_model?: string
          phone_number_id_last4?: string | null
          preferred_language?: string
          response_style?: string
          updated_at?: string
          webhook_verify_token_configured?: boolean
          welcome_message?: string | null
        }
        Update: {
          ai_engine_mode?: string
          ai_handoff_enabled?: boolean
          ai_handoff_validated_at?: string | null
          ai_knowledge_enabled?: boolean
          ai_knowledge_validated_at?: string | null
          ai_mutation_tools_enabled?: boolean
          ai_read_tools_enabled?: boolean
          ai_read_tools_validated_at?: string | null
          clinic_id?: string
          created_at?: string
          default_goal?: string
          display_phone_number?: string | null
          handoff_message?: string
          id?: string
          is_enabled?: boolean
          meta_app_secret_configured?: boolean
          meta_token_configured?: boolean
          openai_key_configured?: boolean
          openai_model?: string
          phone_number_id_last4?: string | null
          preferred_language?: string
          response_style?: string
          updated_at?: string
          webhook_verify_token_configured?: boolean
          welcome_message?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_ai_settings_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: true
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_command_logs: {
        Row: {
          appointment_id: string | null
          clinic_id: string
          created_at: string
          details: Json | null
          id: string
          incoming_text: string | null
          parsed_command: string | null
          result_status: string
          source_phone: string | null
          token_id: string | null
        }
        Insert: {
          appointment_id?: string | null
          clinic_id: string
          created_at?: string
          details?: Json | null
          id?: string
          incoming_text?: string | null
          parsed_command?: string | null
          result_status?: string
          source_phone?: string | null
          token_id?: string | null
        }
        Update: {
          appointment_id?: string | null
          clinic_id?: string
          created_at?: string
          details?: Json | null
          id?: string
          incoming_text?: string | null
          parsed_command?: string | null
          result_status?: string
          source_phone?: string | null
          token_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_command_logs_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_command_logs_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_command_logs_token_id_fkey"
            columns: ["token_id"]
            isOneToOne: false
            referencedRelation: "appointment_whatsapp_tokens"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_connections: {
        Row: {
          business_name: string | null
          clinic_id: string
          connected_at: string
          connected_by: string | null
          created_at: string
          disconnected_at: string | null
          display_phone_number: string | null
          id: string
          metadata: Json
          phone_number_id: string
          status: string
          token_ciphertext: string
          token_expires_at: string | null
          updated_at: string
          waba_id: string
        }
        Insert: {
          business_name?: string | null
          clinic_id: string
          connected_at?: string
          connected_by?: string | null
          created_at?: string
          disconnected_at?: string | null
          display_phone_number?: string | null
          id?: string
          metadata?: Json
          phone_number_id: string
          status?: string
          token_ciphertext: string
          token_expires_at?: string | null
          updated_at?: string
          waba_id: string
        }
        Update: {
          business_name?: string | null
          clinic_id?: string
          connected_at?: string
          connected_by?: string | null
          created_at?: string
          disconnected_at?: string | null
          display_phone_number?: string | null
          id?: string
          metadata?: Json
          phone_number_id?: string
          status?: string
          token_ciphertext?: string
          token_expires_at?: string | null
          updated_at?: string
          waba_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_connections_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: true
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_renewal_tasks_active: {
        Row: {
          assigned_to: string | null
          avg_rating: number | null
          clinic_id: string | null
          contract_id: string | null
          contract_item_id: string | null
          converted_proposal_id: string | null
          created_at: string | null
          days_since_created: number | null
          days_since_last_action: number | null
          discarded_reason: string | null
          discarded_reason_notes: string | null
          id: string | null
          last_action_at: string | null
          last_action_type: string | null
          patient_created_at: string | null
          patient_id: string | null
          patient_ltv: number | null
          patient_name: string | null
          patient_phone: string | null
          scheduled_for: string | null
          sessions_completed: number | null
          sessions_total: number | null
          sla_red_at: string | null
          sla_yellow_at: string | null
          snooze_count: number | null
          snoozed_until: string | null
          status: string | null
          suggested_treatment_id: string | null
          suggested_treatment_name: string | null
          suggested_treatment_rule: string | null
          suggestion_context: Json | null
          treatment_id: string | null
          treatment_name: string | null
          trigger_session_id: string | null
          trigger_type: string | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "renewal_tasks_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "renewal_tasks_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "renewal_tasks_converted_proposal_id_fkey"
            columns: ["converted_proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "renewal_tasks_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "renewal_tasks_suggested_treatment_id_fkey"
            columns: ["suggested_treatment_id"]
            isOneToOne: false
            referencedRelation: "treatments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "renewal_tasks_treatment_id_fkey"
            columns: ["treatment_id"]
            isOneToOne: false
            referencedRelation: "treatments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "renewal_tasks_trigger_session_id_fkey"
            columns: ["trigger_session_id"]
            isOneToOne: false
            referencedRelation: "session_records"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      administrative_text_array_is_valid: {
        Args: {
          maximum_item_length: number
          maximum_items: number
          values_to_check: string[]
        }
        Returns: boolean
      }
      ai_feature_gate_snapshot: {
        Args: {
          p_row: Database["public"]["Tables"]["whatsapp_ai_settings"]["Row"]
        }
        Returns: Json
      }
      assert_appointment_slot: {
        Args: {
          p_clinic_id: string
          p_end_time: string
          p_ignore_appointment_id?: string
          p_location_id: string
          p_professional_id: string
          p_start_time: string
          p_treatment_id: string
        }
        Returns: undefined
      }
      auth_clinic_id: { Args: never; Returns: string }
      auth_patient_id: { Args: never; Returns: string }
      auth_user_role: { Args: never; Returns: string }
      authorize_human_conversation_outbound: {
        Args: { p_clinic_id: string; p_conversation_id: string }
        Returns: boolean
      }
      backfill_contract_financial_forecast: {
        Args: { p_clinic_id: string; p_force?: boolean }
        Returns: Json
      }
      cancel_appointment_secure:
        | {
            Args: {
              p_appointment_id: string
              p_reason: string
              p_status?: Database["public"]["Enums"]["appointment_status"]
            }
            Returns: {
              appointment_type: string
              batch_id: string | null
              billing_type: string
              cancelled_reason: string | null
              checked_in_at: string | null
              clinic_id: string
              completed_at: string | null
              confirmed_at: string | null
              connection_id: string | null
              contract_id: string | null
              contract_item_id: string | null
              created_at: string
              created_by: string | null
              credit_check_required: boolean
              credit_check_status: string
              credit_decision_id: string | null
              duration_minutes: number
              end_time: string
              event_origin: string
              external_appointment_id: string | null
              external_etag: string | null
              external_version: string | null
              health_insurance_id: string | null
              id: string
              is_batch: boolean
              is_tombstone: boolean
              last_provider_seen_at: string | null
              last_sync_error_at: string | null
              last_sync_error_code: string | null
              last_sync_error_message: string | null
              last_synced_at: string | null
              lead_id: string | null
              location_id: string | null
              no_show_reason: string | null
              notes: string | null
              patient_id: string | null
              professional_id: string | null
              provider_type: string
              raw_provider_status: string | null
              rescheduled_from: string | null
              rescheduled_to: string | null
              scheduled_at: string | null
              source_of_truth: string
              start_time: string
              status: Database["public"]["Enums"]["appointment_status"]
              sync_conflict_at: string | null
              sync_conflict_code: string | null
              sync_state: string
              tombstoned_at: string | null
              treatment_id: string | null
              unmapped_entity_types: string[]
              updated_at: string
            }
            SetofOptions: {
              from: "*"
              to: "appointments"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: {
              p_appointment_id: string
              p_clinic_id: string
              p_reason: string
              p_status?: Database["public"]["Enums"]["appointment_status"]
            }
            Returns: {
              appointment_type: string
              batch_id: string | null
              billing_type: string
              cancelled_reason: string | null
              checked_in_at: string | null
              clinic_id: string
              completed_at: string | null
              confirmed_at: string | null
              connection_id: string | null
              contract_id: string | null
              contract_item_id: string | null
              created_at: string
              created_by: string | null
              credit_check_required: boolean
              credit_check_status: string
              credit_decision_id: string | null
              duration_minutes: number
              end_time: string
              event_origin: string
              external_appointment_id: string | null
              external_etag: string | null
              external_version: string | null
              health_insurance_id: string | null
              id: string
              is_batch: boolean
              is_tombstone: boolean
              last_provider_seen_at: string | null
              last_sync_error_at: string | null
              last_sync_error_code: string | null
              last_sync_error_message: string | null
              last_synced_at: string | null
              lead_id: string | null
              location_id: string | null
              no_show_reason: string | null
              notes: string | null
              patient_id: string | null
              professional_id: string | null
              provider_type: string
              raw_provider_status: string | null
              rescheduled_from: string | null
              rescheduled_to: string | null
              scheduled_at: string | null
              source_of_truth: string
              start_time: string
              status: Database["public"]["Enums"]["appointment_status"]
              sync_conflict_at: string | null
              sync_conflict_code: string | null
              sync_state: string
              tombstoned_at: string | null
              treatment_id: string | null
              unmapped_entity_types: string[]
              updated_at: string
            }
            SetofOptions: {
              from: "*"
              to: "appointments"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      claim_ai_tool_mutation: {
        Args: {
          p_clinic_id: string
          p_conversation_id: string
          p_correlation_id: string
          p_tool_name: string
        }
        Returns: boolean
      }
      confirm_appointment_secure: {
        Args: { p_appointment_id: string; p_clinic_id: string }
        Returns: {
          appointment_type: string
          batch_id: string | null
          billing_type: string
          cancelled_reason: string | null
          checked_in_at: string | null
          clinic_id: string
          completed_at: string | null
          confirmed_at: string | null
          connection_id: string | null
          contract_id: string | null
          contract_item_id: string | null
          created_at: string
          created_by: string | null
          credit_check_required: boolean
          credit_check_status: string
          credit_decision_id: string | null
          duration_minutes: number
          end_time: string
          event_origin: string
          external_appointment_id: string | null
          external_etag: string | null
          external_version: string | null
          health_insurance_id: string | null
          id: string
          is_batch: boolean
          is_tombstone: boolean
          last_provider_seen_at: string | null
          last_sync_error_at: string | null
          last_sync_error_code: string | null
          last_sync_error_message: string | null
          last_synced_at: string | null
          lead_id: string | null
          location_id: string | null
          no_show_reason: string | null
          notes: string | null
          patient_id: string | null
          professional_id: string | null
          provider_type: string
          raw_provider_status: string | null
          rescheduled_from: string | null
          rescheduled_to: string | null
          scheduled_at: string | null
          source_of_truth: string
          start_time: string
          status: Database["public"]["Enums"]["appointment_status"]
          sync_conflict_at: string | null
          sync_conflict_code: string | null
          sync_state: string
          tombstoned_at: string | null
          treatment_id: string | null
          unmapped_entity_types: string[]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "appointments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_appointment_secure: {
        Args: {
          p_appointment_type?: string
          p_billing_type?: string
          p_clinic_id: string
          p_contract_id?: string
          p_contract_item_id?: string
          p_duration_minutes?: number
          p_health_insurance_id?: string
          p_lead_id: string
          p_location_id: string
          p_notes?: string
          p_patient_id: string
          p_professional_id: string
          p_start_time: string
          p_treatment_id: string
        }
        Returns: {
          appointment_type: string
          batch_id: string | null
          billing_type: string
          cancelled_reason: string | null
          checked_in_at: string | null
          clinic_id: string
          completed_at: string | null
          confirmed_at: string | null
          connection_id: string | null
          contract_id: string | null
          contract_item_id: string | null
          created_at: string
          created_by: string | null
          credit_check_required: boolean
          credit_check_status: string
          credit_decision_id: string | null
          duration_minutes: number
          end_time: string
          event_origin: string
          external_appointment_id: string | null
          external_etag: string | null
          external_version: string | null
          health_insurance_id: string | null
          id: string
          is_batch: boolean
          is_tombstone: boolean
          last_provider_seen_at: string | null
          last_sync_error_at: string | null
          last_sync_error_code: string | null
          last_sync_error_message: string | null
          last_synced_at: string | null
          lead_id: string | null
          location_id: string | null
          no_show_reason: string | null
          notes: string | null
          patient_id: string | null
          professional_id: string | null
          provider_type: string
          raw_provider_status: string | null
          rescheduled_from: string | null
          rescheduled_to: string | null
          scheduled_at: string | null
          source_of_truth: string
          start_time: string
          status: Database["public"]["Enums"]["appointment_status"]
          sync_conflict_at: string | null
          sync_conflict_code: string | null
          sync_state: string
          tombstoned_at: string | null
          treatment_id: string | null
          unmapped_entity_types: string[]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "appointments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_aura_operational_metrics: {
        Args: { p_clinic_id: string; p_since: string; p_until: string }
        Returns: Json
      }
      get_aura_pilot_snapshot: { Args: { p_clinic_id: string }; Returns: Json }
      get_available_slots:
        | {
            Args: {
              p_clinic_id: string
              p_date_from: string
              p_date_to: string
              p_location_id: string
              p_professional_id: string
              p_step_minutes?: number
              p_treatment_id: string
            }
            Returns: {
              duration_minutes: number
              end_time: string
              start_time: string
            }[]
          }
        | {
            Args: {
              p_billing_type: string
              p_clinic_id: string
              p_date_from: string
              p_date_to: string
              p_health_insurance_id: string
              p_location_id: string
              p_professional_id: string
              p_step_minutes: number
              p_treatment_id: string
            }
            Returns: {
              duration_minutes: number
              end_time: string
              start_time: string
            }[]
          }
      get_finance_contract_forecast_detail: {
        Args: { p_contract_id: string }
        Returns: Json
      }
      get_finance_contract_sellers: {
        Args: { p_clinic_id: string }
        Returns: {
          seller_id: string
          seller_name: string
        }[]
      }
      get_finance_contracts_monthly_matrix:
        | {
            Args: {
              p_clinic_id: string
              p_contract_status?: string
              p_end_date?: string
              p_payment_method?: string
              p_reference_year?: number
              p_search?: string
              p_seller_id?: string
              p_start_date?: string
              p_treatment_id?: string
            }
            Returns: {
              approval_date: string
              apr_total: number
              aug_total: number
              boleto_total: number
              card_total: number
              cash_total: number
              contract_id: string
              contract_number: string
              contract_total: number
              dec_total: number
              divergence_reason: string
              feb_total: number
              has_financial_divergence: boolean
              jan_total: number
              jul_total: number
              jun_total: number
              mar_total: number
              may_total: number
              nov_total: number
              oct_total: number
              other_total: number
              out_of_period_total: number
              patient_cpf: string
              patient_name: string
              pix_total: number
              seller_id: string
              seller_name: string
              sep_total: number
              total_predicted: number
              treatments: string
            }[]
          }
        | {
            Args: {
              p_clinic_id: string
              p_contract_status?: string
              p_end_date?: string
              p_payment_method?: string
              p_search?: string
              p_seller_id?: string
              p_start_date?: string
              p_treatment_id?: string
            }
            Returns: {
              apr_total: number
              aug_total: number
              boleto_total: number
              card_total: number
              cash_total: number
              contract_id: string
              contract_number: string
              contract_total: number
              dec_total: number
              divergence_reason: string
              feb_total: number
              has_financial_divergence: boolean
              jan_total: number
              jul_total: number
              jun_total: number
              mar_total: number
              may_total: number
              nov_total: number
              oct_total: number
              other_total: number
              patient_cpf: string
              patient_name: string
              pix_total: number
              seller_name: string
              sep_total: number
              total_predicted: number
              treatments: string
            }[]
          }
      get_finance_contracts_prediction_summary:
        | {
            Args: {
              p_clinic_id: string
              p_contract_status?: string
              p_end_date?: string
              p_payment_method?: string
              p_reference_year?: number
              p_search?: string
              p_seller_id?: string
              p_start_date?: string
              p_treatment_id?: string
            }
            Returns: {
              average_ticket: number
              boleto_predicted: number
              card_predicted: number
              cash_predicted: number
              other_predicted: number
              pix_predicted: number
              total_contract_value: number
              total_contracts: number
              total_predicted_period: number
            }[]
          }
        | {
            Args: {
              p_clinic_id: string
              p_contract_status?: string
              p_end_date?: string
              p_payment_method?: string
              p_search?: string
              p_seller_id?: string
              p_start_date?: string
              p_treatment_id?: string
            }
            Returns: {
              average_ticket: number
              boleto_predicted: number
              card_predicted: number
              cash_predicted: number
              other_predicted: number
              pix_predicted: number
              total_contract_value: number
              total_contracts: number
              total_predicted_period: number
            }[]
          }
      get_patient_clinic_id: {
        Args: { _patient_user_id: string }
        Returns: string[]
      }
      get_patient_ids_for_user: {
        Args: { _user_id: string }
        Returns: string[]
      }
      get_renewal_suggestion: {
        Args: {
          p_clinic_id: string
          p_min_rating: number
          p_patient_id: string
          p_treatment_id: string
        }
        Returns: {
          suggested_rule: string
          suggested_treatment_id: string
          suggestion_context: Json
        }[]
      }
      get_user_clinic_ids: { Args: { _user_id: string }; Returns: string[] }
      has_clinic_role: {
        Args: {
          _clinic_id: string
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_menu_access: {
        Args: { _clinic_id: string; _permission_key: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_clinic_staff: {
        Args: { _clinic_id: string; _user_id: string }
        Returns: boolean
      }
      list_ai_handoff_staff: {
        Args: { p_clinic_id: string }
        Returns: {
          label: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }[]
      }
      normalize_payment_method: { Args: { _value: string }; Returns: string }
      parse_brl_amount: { Args: { _value: string }; Returns: number }
      reassign_appointment_professional_secure: {
        Args: {
          p_appointment_id: string
          p_clinic_id: string
          p_professional_id: string
        }
        Returns: {
          appointment_type: string
          batch_id: string | null
          billing_type: string
          cancelled_reason: string | null
          checked_in_at: string | null
          clinic_id: string
          completed_at: string | null
          confirmed_at: string | null
          connection_id: string | null
          contract_id: string | null
          contract_item_id: string | null
          created_at: string
          created_by: string | null
          credit_check_required: boolean
          credit_check_status: string
          credit_decision_id: string | null
          duration_minutes: number
          end_time: string
          event_origin: string
          external_appointment_id: string | null
          external_etag: string | null
          external_version: string | null
          health_insurance_id: string | null
          id: string
          is_batch: boolean
          is_tombstone: boolean
          last_provider_seen_at: string | null
          last_sync_error_at: string | null
          last_sync_error_code: string | null
          last_sync_error_message: string | null
          last_synced_at: string | null
          lead_id: string | null
          location_id: string | null
          no_show_reason: string | null
          notes: string | null
          patient_id: string | null
          professional_id: string | null
          provider_type: string
          raw_provider_status: string | null
          rescheduled_from: string | null
          rescheduled_to: string | null
          scheduled_at: string | null
          source_of_truth: string
          start_time: string
          status: Database["public"]["Enums"]["appointment_status"]
          sync_conflict_at: string | null
          sync_conflict_code: string | null
          sync_state: string
          tombstoned_at: string | null
          treatment_id: string | null
          unmapped_entity_types: string[]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "appointments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_ai_conversation_failure: {
        Args: {
          p_clinic_id: string
          p_conversation_id: string
          p_correlation_id: string
          p_reason: string
          p_threshold?: number
        }
        Returns: {
          accepted_at: string | null
          assigned_at: string | null
          assigned_user_id: string | null
          clinic_id: string
          conversation_id: string
          correlation_id: string | null
          created_at: string
          id: string
          priority: string
          reason: string
          requested_at: string
          requested_by: string | null
          resolution: string | null
          resolved_at: string | null
          sanitized_description: string | null
          source: string
          status: string
          summary: Json
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "ai_conversation_handoffs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_ai_operational_event: {
        Args: {
          p_channel: string
          p_clinic_id: string
          p_component: string
          p_conversation_id: string
          p_correlation_id: string
          p_error_category?: string
          p_error_code?: string
          p_event_type: string
          p_latency_ms?: number
          p_outcome: string
          p_retryable?: boolean
        }
        Returns: undefined
      }
      renewal_tasks_daily_maintenance: { Args: never; Returns: undefined }
      request_ai_conversation_handoff: {
        Args: {
          p_clinic_id: string
          p_conversation_id: string
          p_correlation_id: string
          p_description?: string
          p_priority: string
          p_reason: string
          p_source: string
          p_summary?: Json
        }
        Returns: {
          accepted_at: string | null
          assigned_at: string | null
          assigned_user_id: string | null
          clinic_id: string
          conversation_id: string
          correlation_id: string | null
          created_at: string
          id: string
          priority: string
          reason: string
          requested_at: string
          requested_by: string | null
          resolution: string | null
          resolved_at: string | null
          sanitized_description: string | null
          source: string
          status: string
          summary: Json
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "ai_conversation_handoffs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reschedule_appointment_secure: {
        Args: {
          p_appointment_id: string
          p_clinic_id: string
          p_duration_minutes?: number
          p_location_id?: string
          p_notes?: string
          p_professional_id?: string
          p_reason?: string
          p_start_time: string
        }
        Returns: {
          appointment_type: string
          batch_id: string | null
          billing_type: string
          cancelled_reason: string | null
          checked_in_at: string | null
          clinic_id: string
          completed_at: string | null
          confirmed_at: string | null
          connection_id: string | null
          contract_id: string | null
          contract_item_id: string | null
          created_at: string
          created_by: string | null
          credit_check_required: boolean
          credit_check_status: string
          credit_decision_id: string | null
          duration_minutes: number
          end_time: string
          event_origin: string
          external_appointment_id: string | null
          external_etag: string | null
          external_version: string | null
          health_insurance_id: string | null
          id: string
          is_batch: boolean
          is_tombstone: boolean
          last_provider_seen_at: string | null
          last_sync_error_at: string | null
          last_sync_error_code: string | null
          last_sync_error_message: string | null
          last_synced_at: string | null
          lead_id: string | null
          location_id: string | null
          no_show_reason: string | null
          notes: string | null
          patient_id: string | null
          professional_id: string | null
          provider_type: string
          raw_provider_status: string | null
          rescheduled_from: string | null
          rescheduled_to: string | null
          scheduled_at: string | null
          source_of_truth: string
          start_time: string
          status: Database["public"]["Enums"]["appointment_status"]
          sync_conflict_at: string | null
          sync_conflict_code: string | null
          sync_state: string
          tombstoned_at: string | null
          treatment_id: string | null
          unmapped_entity_types: string[]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "appointments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reset_ai_conversation_failures: {
        Args: { p_clinic_id: string; p_conversation_id: string }
        Returns: undefined
      }
      resolve_ai_conversation_handoff: {
        Args: {
          p_clinic_id: string
          p_conversation_id: string
          p_resolution: string
        }
        Returns: {
          accepted_at: string | null
          assigned_at: string | null
          assigned_user_id: string | null
          clinic_id: string
          conversation_id: string
          correlation_id: string | null
          created_at: string
          id: string
          priority: string
          reason: string
          requested_at: string
          requested_by: string | null
          resolution: string | null
          resolved_at: string | null
          sanitized_description: string | null
          source: string
          status: string
          summary: Json
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "ai_conversation_handoffs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      resolve_appointment_duration:
        | {
            Args: {
              p_clinic_id: string
              p_professional_id: string
              p_treatment_id?: string
            }
            Returns: number
          }
        | {
            Args: {
              p_billing_type: string
              p_clinic_id: string
              p_health_insurance_id: string
              p_professional_id: string
              p_treatment_id: string
            }
            Returns: number
          }
      take_over_ai_conversation: {
        Args: { p_clinic_id: string; p_conversation_id: string }
        Returns: {
          accepted_at: string | null
          assigned_at: string | null
          assigned_user_id: string | null
          clinic_id: string
          conversation_id: string
          correlation_id: string | null
          created_at: string
          id: string
          priority: string
          reason: string
          requested_at: string
          requested_by: string | null
          resolution: string | null
          resolved_at: string | null
          sanitized_description: string | null
          source: string
          status: string
          summary: Json
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "ai_conversation_handoffs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      transfer_ai_conversation: {
        Args: {
          p_clinic_id: string
          p_conversation_id: string
          p_target_user_id: string
        }
        Returns: {
          accepted_at: string | null
          assigned_at: string | null
          assigned_user_id: string | null
          clinic_id: string
          conversation_id: string
          correlation_id: string | null
          created_at: string
          id: string
          priority: string
          reason: string
          requested_at: string
          requested_by: string | null
          resolution: string | null
          resolved_at: string | null
          sanitized_description: string | null
          source: string
          status: string
          summary: Json
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "ai_conversation_handoffs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      transition_appointment_status_secure: {
        Args: {
          p_appointment_id: string
          p_clinic_id: string
          p_status: Database["public"]["Enums"]["appointment_status"]
        }
        Returns: {
          appointment_type: string
          batch_id: string | null
          billing_type: string
          cancelled_reason: string | null
          checked_in_at: string | null
          clinic_id: string
          completed_at: string | null
          confirmed_at: string | null
          connection_id: string | null
          contract_id: string | null
          contract_item_id: string | null
          created_at: string
          created_by: string | null
          credit_check_required: boolean
          credit_check_status: string
          credit_decision_id: string | null
          duration_minutes: number
          end_time: string
          event_origin: string
          external_appointment_id: string | null
          external_etag: string | null
          external_version: string | null
          health_insurance_id: string | null
          id: string
          is_batch: boolean
          is_tombstone: boolean
          last_provider_seen_at: string | null
          last_sync_error_at: string | null
          last_sync_error_code: string | null
          last_sync_error_message: string | null
          last_synced_at: string | null
          lead_id: string | null
          location_id: string | null
          no_show_reason: string | null
          notes: string | null
          patient_id: string | null
          professional_id: string | null
          provider_type: string
          raw_provider_status: string | null
          rescheduled_from: string | null
          rescheduled_to: string | null
          scheduled_at: string | null
          source_of_truth: string
          start_time: string
          status: Database["public"]["Enums"]["appointment_status"]
          sync_conflict_at: string | null
          sync_conflict_code: string | null
          sync_state: string
          tombstoned_at: string | null
          treatment_id: string | null
          unmapped_entity_types: string[]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "appointments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      unassign_ai_conversation: {
        Args: { p_clinic_id: string; p_conversation_id: string }
        Returns: {
          accepted_at: string | null
          assigned_at: string | null
          assigned_user_id: string | null
          clinic_id: string
          conversation_id: string
          correlation_id: string | null
          created_at: string
          id: string
          priority: string
          reason: string
          requested_at: string
          requested_by: string | null
          resolution: string | null
          resolved_at: string | null
          sanitized_description: string | null
          source: string
          status: string
          summary: Json
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "ai_conversation_handoffs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_whatsapp_ai_conversation_state: {
        Args: {
          p_clinic_id: string
          p_conversation_id: string
          p_expected_revision: number
          p_state: Json
        }
        Returns: Json
      }
      upsert_contract_financial_forecast: {
        Args: { p_contract_id: string; p_force?: boolean }
        Returns: Json
      }
      user_belongs_to_clinic: {
        Args: { _clinic_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "receptionist" | "professional" | "patient" | "sales"
      appointment_status:
        | "scheduled"
        | "confirmed"
        | "in_progress"
        | "completed"
        | "cancelled"
        | "no_show"
        | "rescheduled"
      contract_status: "draft" | "active" | "completed" | "cancelled"
      patient_status: "active" | "inactive" | "completed" | "pending"
      payment_method:
        | "credit_card"
        | "debit_card"
        | "pix"
        | "bank_transfer"
        | "cash"
        | "boleto"
      payment_status: "pending" | "paid" | "overdue" | "cancelled" | "refunded"
      photo_type: "before" | "during" | "after" | "progress"
      proposal_status: "draft" | "sent" | "accepted" | "rejected" | "expired"
      reminder_channel: "whatsapp" | "email" | "sms"
      reminder_status: "pending" | "sent" | "failed" | "cancelled"
      waitlist_contact_preference: "whatsapp" | "phone" | "email"
      waitlist_priority: "normal" | "high" | "urgent"
      waitlist_status:
        | "waiting"
        | "match_found"
        | "contact_attempted"
        | "scheduled"
        | "expired"
        | "cancelled_by_patient"
        | "cancelled_by_clinic"
      waitlist_window_type: "this_week" | "next_week" | "this_month" | "custom"
      whatsapp_command_status: "pending" | "confirmed" | "cancelled" | "expired"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      app_role: ["admin", "receptionist", "professional", "patient", "sales"],
      appointment_status: [
        "scheduled",
        "confirmed",
        "in_progress",
        "completed",
        "cancelled",
        "no_show",
        "rescheduled",
      ],
      contract_status: ["draft", "active", "completed", "cancelled"],
      patient_status: ["active", "inactive", "completed", "pending"],
      payment_method: [
        "credit_card",
        "debit_card",
        "pix",
        "bank_transfer",
        "cash",
        "boleto",
      ],
      payment_status: ["pending", "paid", "overdue", "cancelled", "refunded"],
      photo_type: ["before", "during", "after", "progress"],
      proposal_status: ["draft", "sent", "accepted", "rejected", "expired"],
      reminder_channel: ["whatsapp", "email", "sms"],
      reminder_status: ["pending", "sent", "failed", "cancelled"],
      waitlist_contact_preference: ["whatsapp", "phone", "email"],
      waitlist_priority: ["normal", "high", "urgent"],
      waitlist_status: [
        "waiting",
        "match_found",
        "contact_attempted",
        "scheduled",
        "expired",
        "cancelled_by_patient",
        "cancelled_by_clinic",
      ],
      waitlist_window_type: ["this_week", "next_week", "this_month", "custom"],
      whatsapp_command_status: ["pending", "confirmed", "cancelled", "expired"],
    },
  },
} as const
