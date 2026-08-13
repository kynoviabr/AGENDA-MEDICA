export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      appointments: {
        Row: {
          clinic_id: string
          created_at: string
          created_by: string | null
          end_time: string
          id: string
          notes: string | null
          patient_id: string
          professional_id: string | null
          start_time: string
          status: Database["public"]["Enums"]["appointment_status"]
          treatment_id: string | null
          updated_at: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          created_by?: string | null
          end_time: string
          id?: string
          notes?: string | null
          patient_id: string
          professional_id?: string | null
          start_time: string
          status?: Database["public"]["Enums"]["appointment_status"]
          treatment_id?: string | null
          updated_at?: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          created_by?: string | null
          end_time?: string
          id?: string
          notes?: string | null
          patient_id?: string
          professional_id?: string | null
          start_time?: string
          status?: Database["public"]["Enums"]["appointment_status"]
          treatment_id?: string | null
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
            foreignKeyName: "appointments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
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
          id: string
          name: string
          status: string
          updated_at: string
        }
        Insert: {
          abbreviation: string
          clinic_id: string
          created_at?: string
          id?: string
          name: string
          status?: string
          updated_at?: string
        }
        Update: {
          abbreviation?: string
          clinic_id?: string
          created_at?: string
          id?: string
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
      contracts: {
        Row: {
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
      professional_treatments: {
        Row: {
          created_at: string
          id: string
          professional_id: string
          status: string
          treatment_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          professional_id: string
          status?: string
          treatment_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          professional_id?: string
          status?: string
          treatment_id?: string
          updated_at?: string
        }
        Relationships: [
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
          class_entity_id: string | null
          clinic_id: string
          cpf: string | null
          created_at: string
          email: string | null
          full_name: string
          id: string
          phone: string | null
          registration_number: string | null
          role_id: string | null
          specialty: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          class_entity_id?: string | null
          clinic_id: string
          cpf?: string | null
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          phone?: string | null
          registration_number?: string | null
          role_id?: string | null
          specialty?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          class_entity_id?: string | null
          clinic_id?: string
          cpf?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          phone?: string | null
          registration_number?: string | null
          role_id?: string | null
          specialty?: string | null
          status?: string
          updated_at?: string
          user_id?: string
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
          clinic_id: string
          created_at: string | null
          created_by: string | null
          goal_amount: number
          id: string
          period_reference: string
          period_type: string
          user_id: string
        }
        Insert: {
          clinic_id: string
          created_at?: string | null
          created_by?: string | null
          goal_amount: number
          id?: string
          period_reference: string
          period_type: string
          user_id: string
        }
        Update: {
          clinic_id?: string
          created_at?: string | null
          created_by?: string | null
          goal_amount?: number
          id?: string
          period_reference?: string
          period_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_goals_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
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
          id: string
          name: string
          status: string | null
        }
        Insert: {
          clinic_id: string
          created_at?: string | null
          id?: string
          name: string
          status?: string | null
        }
        Update: {
          clinic_id?: string
          created_at?: string | null
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
          price: number
          updated_at: string
        }
        Insert: {
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
          price?: number
          updated_at?: string
        }
        Update: {
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
          price?: number
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      auth_clinic_id: { Args: never; Returns: string }
      auth_patient_id: { Args: never; Returns: string }
      auth_user_role: { Args: never; Returns: string }
      get_patient_clinic_id: {
        Args: { _patient_user_id: string }
        Returns: string[]
      }
      get_patient_ids_for_user: {
        Args: { _user_id: string }
        Returns: string[]
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
      user_belongs_to_clinic: {
        Args: { _clinic_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "receptionist" | "professional" | "patient"
      appointment_status:
        | "scheduled"
        | "confirmed"
        | "in_progress"
        | "completed"
        | "cancelled"
        | "no_show"
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
  public: {
    Enums: {
      app_role: ["admin", "receptionist", "professional", "patient"],
      appointment_status: [
        "scheduled",
        "confirmed",
        "in_progress",
        "completed",
        "cancelled",
        "no_show",
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
    },
  },
} as const
