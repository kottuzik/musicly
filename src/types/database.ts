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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      admin_permissions: {
        Row: {
          delete_student_history: boolean
          profile_id: string
          updated_at: string
        }
        Insert: {
          delete_student_history?: boolean
          profile_id: string
          updated_at?: string
        }
        Update: {
          delete_student_history?: boolean
          profile_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_permissions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_usage: {
        Row: {
          created_at: string
          id: string
          outcome: string
          tokens_in: number
          tokens_out: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          outcome?: string
          tokens_in?: number
          tokens_out?: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          outcome?: string
          tokens_in?: number
          tokens_out?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance: {
        Row: {
          created_at: string
          lesson_id: string
          note: string | null
          reported_by: string | null
          status: Database["public"]["Enums"]["attendance_status"]
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          created_at?: string
          lesson_id: string
          note?: string | null
          reported_by?: string | null
          status: Database["public"]["Enums"]["attendance_status"]
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          created_at?: string
          lesson_id?: string
          note?: string | null
          reported_by?: string | null
          status?: Database["public"]["Enums"]["attendance_status"]
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "attendance_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: true
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_reported_by_fkey"
            columns: ["reported_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_events: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          entity: string
          entity_id: string
          id: string
          new_values: Json | null
          old_values: Json | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          entity: string
          entity_id: string
          id?: string
          new_values?: Json | null
          old_values?: Json | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          entity?: string
          entity_id?: string
          id?: string
          new_values?: Json | null
          old_values?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      availability_requests: {
        Row: {
          availability_id: string | null
          created_at: string
          day_of_week: number | null
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          end_date: string | null
          end_time: string | null
          id: string
          kind: Database["public"]["Enums"]["availability_request_kind"]
          reason: string | null
          requested_by: string
          start_date: string
          start_time: string | null
          status: Database["public"]["Enums"]["request_status"]
          teacher_id: string
          updated_at: string
          version: number
        }
        Insert: {
          availability_id?: string | null
          created_at?: string
          day_of_week?: number | null
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          end_date?: string | null
          end_time?: string | null
          id?: string
          kind: Database["public"]["Enums"]["availability_request_kind"]
          reason?: string | null
          requested_by: string
          start_date: string
          start_time?: string | null
          status?: Database["public"]["Enums"]["request_status"]
          teacher_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          availability_id?: string | null
          created_at?: string
          day_of_week?: number | null
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          end_date?: string | null
          end_time?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["availability_request_kind"]
          reason?: string | null
          requested_by?: string
          start_date?: string
          start_time?: string | null
          status?: Database["public"]["Enums"]["request_status"]
          teacher_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "availability_requests_availability_id_fkey"
            columns: ["availability_id"]
            isOneToOne: false
            referencedRelation: "teacher_availability"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "availability_requests_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "availability_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "availability_requests_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      email_outbox: {
        Row: {
          attempts: number
          created_at: string
          dedupe_key: string
          id: string
          kind: string
          last_error: string | null
          locked_until: string | null
          next_attempt_at: string
          notification_id: string | null
          payload: Json
          provider_id: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["email_status"]
          to_email: string
          user_id: string | null
        }
        Insert: {
          attempts?: number
          created_at?: string
          dedupe_key: string
          id?: string
          kind: string
          last_error?: string | null
          locked_until?: string | null
          next_attempt_at?: string
          notification_id?: string | null
          payload?: Json
          provider_id?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["email_status"]
          to_email: string
          user_id?: string | null
        }
        Update: {
          attempts?: number
          created_at?: string
          dedupe_key?: string
          id?: string
          kind?: string
          last_error?: string | null
          locked_until?: string | null
          next_attempt_at?: string
          notification_id?: string | null
          payload?: Json
          provider_id?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["email_status"]
          to_email?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_outbox_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_outbox_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      exception_booking_requests: {
        Row: {
          apply_from: string | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          duration_minutes: number
          end_date: string | null
          first_start_at: string
          id: string
          kind: Database["public"]["Enums"]["exception_request_kind"]
          lesson_id: string | null
          lesson_type_id: string
          location: Database["public"]["Enums"]["lesson_location"]
          outside_hours: boolean
          requested_by: string
          result_note: string | null
          series_id: string | null
          start_date: string
          start_time: string
          status: Database["public"]["Enums"]["exception_request_status"]
          student_id: string
          target_lesson_id: string | null
          target_series_id: string | null
          teacher_id: string
          updated_at: string
          version: number
        }
        Insert: {
          apply_from?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          duration_minutes: number
          end_date?: string | null
          first_start_at: string
          id?: string
          kind: Database["public"]["Enums"]["exception_request_kind"]
          lesson_id?: string | null
          lesson_type_id: string
          location: Database["public"]["Enums"]["lesson_location"]
          outside_hours?: boolean
          requested_by: string
          result_note?: string | null
          series_id?: string | null
          start_date: string
          start_time: string
          status?: Database["public"]["Enums"]["exception_request_status"]
          student_id: string
          target_lesson_id?: string | null
          target_series_id?: string | null
          teacher_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          apply_from?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          duration_minutes?: number
          end_date?: string | null
          first_start_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["exception_request_kind"]
          lesson_id?: string | null
          lesson_type_id?: string
          location?: Database["public"]["Enums"]["lesson_location"]
          outside_hours?: boolean
          requested_by?: string
          result_note?: string | null
          series_id?: string | null
          start_date?: string
          start_time?: string
          status?: Database["public"]["Enums"]["exception_request_status"]
          student_id?: string
          target_lesson_id?: string | null
          target_series_id?: string | null
          teacher_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "exception_booking_requests_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exception_booking_requests_lesson_fk"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exception_booking_requests_lesson_type_id_fkey"
            columns: ["lesson_type_id"]
            isOneToOne: false
            referencedRelation: "lesson_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exception_booking_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exception_booking_requests_series_fk"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "lesson_series"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exception_booking_requests_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exception_booking_requests_target_lesson_id_fkey"
            columns: ["target_lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exception_booking_requests_target_series_id_fkey"
            columns: ["target_series_id"]
            isOneToOne: false
            referencedRelation: "lesson_series"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exception_booking_requests_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      invitations: {
        Row: {
          created_at: string
          created_by: string
          email: string
          expires_at: string
          full_name: string
          id: string
          revoked_at: string | null
          role: Database["public"]["Enums"]["invitation_role"]
          teacher_id: string | null
          token_hash: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          email: string
          expires_at: string
          full_name: string
          id?: string
          revoked_at?: string | null
          role: Database["public"]["Enums"]["invitation_role"]
          teacher_id?: string | null
          token_hash: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          email?: string
          expires_at?: string
          full_name?: string
          id?: string
          revoked_at?: string | null
          role?: Database["public"]["Enums"]["invitation_role"]
          teacher_id?: string | null
          token_hash?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invitations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      job_runs: {
        Row: {
          finished_at: string
          id: number
          job: string
          ok: boolean
          started_at: string
          summary: Json
        }
        Insert: {
          finished_at?: string
          id?: never
          job: string
          ok: boolean
          started_at?: string
          summary?: Json
        }
        Update: {
          finished_at?: string
          id?: never
          job?: string
          ok?: boolean
          started_at?: string
          summary?: Json
        }
        Relationships: []
      }
      lesson_change_requests: {
        Row: {
          counter_date: string | null
          counter_start_time: string | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          id: string
          kind: Database["public"]["Enums"]["lesson_change_kind"]
          lesson_id: string
          proposed_date: string | null
          proposed_start_time: string | null
          reason: string | null
          requested_by: string
          status: Database["public"]["Enums"]["request_status"]
          teacher_id: string
          updated_at: string
          version: number
        }
        Insert: {
          counter_date?: string | null
          counter_start_time?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          id?: string
          kind: Database["public"]["Enums"]["lesson_change_kind"]
          lesson_id: string
          proposed_date?: string | null
          proposed_start_time?: string | null
          reason?: string | null
          requested_by: string
          status?: Database["public"]["Enums"]["request_status"]
          teacher_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          counter_date?: string | null
          counter_start_time?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["lesson_change_kind"]
          lesson_id?: string
          proposed_date?: string | null
          proposed_start_time?: string | null
          reason?: string | null
          requested_by?: string
          status?: Database["public"]["Enums"]["request_status"]
          teacher_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "lesson_change_requests_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_change_requests_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_change_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_change_requests_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_reminder_overrides: {
        Row: {
          lesson_id: string
          mode: Database["public"]["Enums"]["reminder_mode"]
          offsets_minutes: number[]
          teacher_id: string
          updated_at: string
        }
        Insert: {
          lesson_id: string
          mode: Database["public"]["Enums"]["reminder_mode"]
          offsets_minutes?: number[]
          teacher_id: string
          updated_at?: string
        }
        Update: {
          lesson_id?: string
          mode?: Database["public"]["Enums"]["reminder_mode"]
          offsets_minutes?: number[]
          teacher_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_reminder_overrides_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_reminder_overrides_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_series: {
        Row: {
          created_at: string
          created_by: string | null
          day_of_week: number
          duration_minutes: number
          end_date: string | null
          exception_request_id: string | null
          generated_until: string
          id: string
          lesson_type_id: string
          location: Database["public"]["Enums"]["lesson_location"]
          outside_hours: boolean
          start_date: string
          start_time: string
          status: Database["public"]["Enums"]["series_status"]
          student_id: string
          teacher_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          day_of_week: number
          duration_minutes: number
          end_date?: string | null
          exception_request_id?: string | null
          generated_until: string
          id?: string
          lesson_type_id: string
          location: Database["public"]["Enums"]["lesson_location"]
          outside_hours?: boolean
          start_date: string
          start_time: string
          status?: Database["public"]["Enums"]["series_status"]
          student_id: string
          teacher_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          day_of_week?: number
          duration_minutes?: number
          end_date?: string | null
          exception_request_id?: string | null
          generated_until?: string
          id?: string
          lesson_type_id?: string
          location?: Database["public"]["Enums"]["lesson_location"]
          outside_hours?: boolean
          start_date?: string
          start_time?: string
          status?: Database["public"]["Enums"]["series_status"]
          student_id?: string
          teacher_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_series_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_series_exception_request_id_fkey"
            columns: ["exception_request_id"]
            isOneToOne: false
            referencedRelation: "exception_booking_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_series_lesson_type_id_fkey"
            columns: ["lesson_type_id"]
            isOneToOne: false
            referencedRelation: "lesson_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_series_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_series_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_types: {
        Row: {
          color: string
          created_at: string
          default_duration_minutes: number
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          color: string
          created_at?: string
          default_duration_minutes: number
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          default_duration_minutes?: number
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      lessons: {
        Row: {
          attention_reason:
            | Database["public"]["Enums"]["attention_reason"]
            | null
          cancel_reason: string | null
          cancel_source: Database["public"]["Enums"]["cancel_source"] | null
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          created_by: string | null
          end_at: string
          exception_request_id: string | null
          id: string
          lesson_type_id: string
          location: Database["public"]["Enums"]["lesson_location"]
          occurrence_date: string
          outside_hours: boolean
          requires_attention: boolean
          series_id: string | null
          start_at: string
          status: Database["public"]["Enums"]["lesson_status"]
          student_id: string
          teacher_id: string
          updated_at: string
          version: number
        }
        Insert: {
          attention_reason?:
            | Database["public"]["Enums"]["attention_reason"]
            | null
          cancel_reason?: string | null
          cancel_source?: Database["public"]["Enums"]["cancel_source"] | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          created_by?: string | null
          end_at: string
          exception_request_id?: string | null
          id?: string
          lesson_type_id: string
          location: Database["public"]["Enums"]["lesson_location"]
          occurrence_date: string
          outside_hours?: boolean
          requires_attention?: boolean
          series_id?: string | null
          start_at: string
          status?: Database["public"]["Enums"]["lesson_status"]
          student_id: string
          teacher_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          attention_reason?:
            | Database["public"]["Enums"]["attention_reason"]
            | null
          cancel_reason?: string | null
          cancel_source?: Database["public"]["Enums"]["cancel_source"] | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          created_by?: string | null
          end_at?: string
          exception_request_id?: string | null
          id?: string
          lesson_type_id?: string
          location?: Database["public"]["Enums"]["lesson_location"]
          occurrence_date?: string
          outside_hours?: boolean
          requires_attention?: boolean
          series_id?: string | null
          start_at?: string
          status?: Database["public"]["Enums"]["lesson_status"]
          student_id?: string
          teacher_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "lessons_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lessons_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lessons_exception_request_id_fkey"
            columns: ["exception_request_id"]
            isOneToOne: false
            referencedRelation: "exception_booking_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lessons_lesson_type_id_fkey"
            columns: ["lesson_type_id"]
            isOneToOne: false
            referencedRelation: "lesson_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lessons_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "lesson_series"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lessons_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lessons_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          channel: Database["public"]["Enums"]["notification_channel"]
          updated_at: string
          user_id: string
        }
        Insert: {
          channel?: Database["public"]["Enums"]["notification_channel"]
          updated_at?: string
          user_id: string
        }
        Update: {
          channel?: Database["public"]["Enums"]["notification_channel"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          archived_at: string | null
          category: Database["public"]["Enums"]["notification_category"]
          created_at: string
          dedupe_key: string | null
          entity: string | null
          entity_id: string | null
          id: string
          payload: Json
          read_at: string | null
          type: string
          user_id: string
        }
        Insert: {
          archived_at?: string | null
          category: Database["public"]["Enums"]["notification_category"]
          created_at?: string
          dedupe_key?: string | null
          entity?: string | null
          entity_id?: string | null
          id?: string
          payload?: Json
          read_at?: string | null
          type: string
          user_id: string
        }
        Update: {
          archived_at?: string | null
          category?: Database["public"]["Enums"]["notification_category"]
          created_at?: string
          dedupe_key?: string | null
          entity?: string | null
          entity_id?: string | null
          id?: string
          payload?: Json
          read_at?: string | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      operating_hours: {
        Row: {
          close_time: string
          day_of_week: number
          open_time: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          close_time: string
          day_of_week: number
          open_time: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          close_time?: string
          day_of_week?: number
          open_time?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "operating_hours_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          deleted_at: string | null
          email: string
          full_name: string
          id: string
          phone: string | null
          role: Database["public"]["Enums"]["user_role"]
          status: Database["public"]["Enums"]["user_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          email: string
          full_name: string
          id: string
          phone?: string | null
          role: Database["public"]["Enums"]["user_role"]
          status?: Database["public"]["Enums"]["user_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          email?: string
          full_name?: string
          id?: string
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          status?: Database["public"]["Enums"]["user_status"]
          updated_at?: string
        }
        Relationships: []
      }
      reminder_jobs: {
        Row: {
          created_at: string
          due_at: string
          id: string
          lesson_id: string
          offset_minutes: number
          teacher_id: string
        }
        Insert: {
          created_at?: string
          due_at: string
          id?: string
          lesson_id: string
          offset_minutes: number
          teacher_id: string
        }
        Update: {
          created_at?: string
          due_at?: string
          id?: string
          lesson_id?: string
          offset_minutes?: number
          teacher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reminder_jobs_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminder_jobs_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      reminder_preferences: {
        Row: {
          enabled: boolean
          offsets_minutes: number[]
          teacher_id: string
          updated_at: string
        }
        Insert: {
          enabled?: boolean
          offsets_minutes?: number[]
          teacher_id: string
          updated_at?: string
        }
        Update: {
          enabled?: boolean
          offsets_minutes?: number[]
          teacher_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reminder_preferences_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: true
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      school_closures: {
        Row: {
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          created_by: string | null
          end_date: string
          holiday_key: string | null
          id: string
          name: string
          source: Database["public"]["Enums"]["closure_source"]
          start_date: string
          status: Database["public"]["Enums"]["closure_status"]
          updated_at: string
        }
        Insert: {
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          created_by?: string | null
          end_date: string
          holiday_key?: string | null
          id?: string
          name: string
          source: Database["public"]["Enums"]["closure_source"]
          start_date: string
          status?: Database["public"]["Enums"]["closure_status"]
          updated_at?: string
        }
        Update: {
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          created_by?: string | null
          end_date?: string
          holiday_key?: string | null
          id?: string
          name?: string
          source?: Database["public"]["Enums"]["closure_source"]
          start_date?: string
          status?: Database["public"]["Enums"]["closure_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "school_closures_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_closures_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      student_contacts: {
        Row: {
          email: string | null
          parent_email: string | null
          parent_name: string | null
          parent_phone: string | null
          phone: string | null
          student_id: string
          updated_at: string
        }
        Insert: {
          email?: string | null
          parent_email?: string | null
          parent_name?: string | null
          parent_phone?: string | null
          phone?: string | null
          student_id: string
          updated_at?: string
        }
        Update: {
          email?: string | null
          parent_email?: string | null
          parent_name?: string | null
          parent_phone?: string | null
          phone?: string | null
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_contacts_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: true
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      student_subjects: {
        Row: {
          created_at: string
          id: string
          lesson_type_id: string
          level: Database["public"]["Enums"]["student_level"]
          professional_background: string | null
          regular_teacher_id: string
          student_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          lesson_type_id: string
          level: Database["public"]["Enums"]["student_level"]
          professional_background?: string | null
          regular_teacher_id: string
          student_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          lesson_type_id?: string
          level?: Database["public"]["Enums"]["student_level"]
          professional_background?: string | null
          regular_teacher_id?: string
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_subjects_lesson_type_id_fkey"
            columns: ["lesson_type_id"]
            isOneToOne: false
            referencedRelation: "lesson_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_subjects_regular_teacher_id_fkey"
            columns: ["regular_teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_subjects_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      students: {
        Row: {
          anonymized_at: string | null
          birth_date: string | null
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          expected_return_date: string | null
          full_name: string
          id: string
          purge_after: string | null
          return_mode: Database["public"]["Enums"]["student_return_mode"] | null
          return_notified_at: string | null
          status: Database["public"]["Enums"]["user_status"]
          updated_at: string
        }
        Insert: {
          anonymized_at?: string | null
          birth_date?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          expected_return_date?: string | null
          full_name: string
          id?: string
          purge_after?: string | null
          return_mode?:
            | Database["public"]["Enums"]["student_return_mode"]
            | null
          return_notified_at?: string | null
          status?: Database["public"]["Enums"]["user_status"]
          updated_at?: string
        }
        Update: {
          anonymized_at?: string | null
          birth_date?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          expected_return_date?: string | null
          full_name?: string
          id?: string
          purge_after?: string | null
          return_mode?:
            | Database["public"]["Enums"]["student_return_mode"]
            | null
          return_notified_at?: string | null
          status?: Database["public"]["Enums"]["user_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "students_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      teacher_absences: {
        Row: {
          created_at: string
          end_date: string
          end_time: string | null
          id: string
          request_id: string
          start_date: string
          start_time: string | null
          teacher_id: string
        }
        Insert: {
          created_at?: string
          end_date: string
          end_time?: string | null
          id?: string
          request_id: string
          start_date: string
          start_time?: string | null
          teacher_id: string
        }
        Update: {
          created_at?: string
          end_date?: string
          end_time?: string | null
          id?: string
          request_id?: string
          start_date?: string
          start_time?: string | null
          teacher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "teacher_absences_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: true
            referencedRelation: "availability_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teacher_absences_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      teacher_availability: {
        Row: {
          created_at: string
          created_by: string | null
          day_of_week: number
          end_time: string
          id: string
          start_time: string
          teacher_id: string
          updated_at: string
          valid_from: string
          valid_to: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          day_of_week: number
          end_time: string
          id?: string
          start_time: string
          teacher_id: string
          updated_at?: string
          valid_from: string
          valid_to?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          day_of_week?: number
          end_time?: string
          id?: string
          start_time?: string
          teacher_id?: string
          updated_at?: string
          valid_from?: string
          valid_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "teacher_availability_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teacher_availability_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      teacher_skills: {
        Row: {
          lesson_type_id: string
          teacher_id: string
        }
        Insert: {
          lesson_type_id: string
          teacher_id: string
        }
        Update: {
          lesson_type_id?: string
          teacher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "teacher_skills_lesson_type_id_fkey"
            columns: ["lesson_type_id"]
            isOneToOne: false
            referencedRelation: "lesson_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teacher_skills_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      teachers: {
        Row: {
          anonymized_at: string | null
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          email: string | null
          full_name: string
          id: string
          phone: string | null
          profile_id: string | null
          purge_after: string | null
          status: Database["public"]["Enums"]["user_status"]
          updated_at: string
        }
        Insert: {
          anonymized_at?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          email?: string | null
          full_name: string
          id?: string
          phone?: string | null
          profile_id?: string | null
          purge_after?: string | null
          status?: Database["public"]["Enums"]["user_status"]
          updated_at?: string
        }
        Update: {
          anonymized_at?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          email?: string | null
          full_name?: string
          id?: string
          phone?: string | null
          profile_id?: string | null
          purge_after?: string | null
          status?: Database["public"]["Enums"]["user_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "teachers_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teachers_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_invitation: {
        Args: { p_token_hash: string; p_user_id: string }
        Returns: Database["public"]["Enums"]["user_role"]
      }
      activate_or_notify_students: { Args: never; Returns: number }
      add_availability: {
        Args: {
          p_day: number
          p_end: string
          p_start: string
          p_teacher_id: string
        }
        Returns: string
      }
      ai_find_available_teachers: {
        Args: {
          p_date: string
          p_from: string
          p_lesson_type_id: string
          p_to: string
        }
        Returns: {
          free_from: string
          free_to: string
          teacher_id: string
          teacher_name: string
        }[]
      }
      ai_find_people: {
        Args: { p_kind: string; p_lesson_type: string; p_query: string }
        Returns: {
          id: string
          name: string
          status: string
          subjects: string
        }[]
      }
      ai_record_usage: {
        Args: {
          p_id: string
          p_outcome: string
          p_tokens_in: number
          p_tokens_out: number
        }
        Returns: undefined
      }
      ai_reserve_request: {
        Args: { p_daily: number; p_hourly: number }
        Returns: string
      }
      ai_suggest_slots: {
        Args: {
          p_duration: number
          p_from: string
          p_lesson_type_id: string
          p_limit: number
          p_student_id: string
          p_teacher_id: string
          p_to: string
        }
        Returns: {
          end_time: string
          slot_date: string
          start_time: string
          teacher_id: string
          teacher_name: string
        }[]
      }
      apply_availability_request: {
        Args: { p_request_id: string }
        Returns: undefined
      }
      apply_lesson_decision: {
        Args: {
          p_date: string
          p_lesson_id: string
          p_reason: Database["public"]["Enums"]["attention_reason"]
          p_start: string
          p_teacher: string
        }
        Returns: string
      }
      apply_lesson_type_duration: {
        Args: { p_id: string; p_new_duration: number; p_series: Json }
        Returns: Json
      }
      apply_series_change: {
        Args: {
          p_check_availability: boolean
          p_day: number
          p_duration: number
          p_from: string
          p_location: Database["public"]["Enums"]["lesson_location"]
          p_request: string
          p_series: string
          p_start: string
          p_teacher: string
        }
        Returns: Json
      }
      archive_all_notifications: { Args: { p_tab: string }; Returns: number }
      archive_notifications: { Args: { p_ids: string[] }; Returns: number }
      attendance_summary: {
        Args: { p_from: string; p_teacher_id: string; p_to: string }
        Returns: {
          held: number
          student_absent: number
          teacher_absent: number
          unreported: number
        }[]
      }
      availability_impacted_lessons: {
        Args: { p_request_id: string }
        Returns: string[]
      }
      availability_request_impact: {
        Args: { p_request_id: string }
        Returns: {
          color: string
          end_at: string
          lesson_id: string
          lesson_type_name: string
          location: Database["public"]["Enums"]["lesson_location"]
          start_at: string
          student_name: string
        }[]
      }
      book_lesson: {
        Args: {
          p_confirm_outside_hours: boolean
          p_date: string
          p_duration: number
          p_lesson_type_id: string
          p_location: Database["public"]["Enums"]["lesson_location"]
          p_start_time: string
          p_student_id: string
          p_teacher_id: string
        }
        Returns: Json
      }
      can_delete_student_history: { Args: never; Returns: boolean }
      cancel_availability_request: {
        Args: { p_id: string; p_version: number }
        Returns: undefined
      }
      cancel_closure: {
        Args: { p_id: string; p_restore?: string[] }
        Returns: Json
      }
      cancel_exception_request: {
        Args: { p_id: string; p_version: number }
        Returns: undefined
      }
      cancel_lesson: {
        Args: {
          p_confirm_held?: boolean
          p_id: string
          p_reason: string
          p_version: number
        }
        Returns: undefined
      }
      cancel_lesson_change_request: {
        Args: { p_id: string; p_version: number }
        Returns: undefined
      }
      change_series: {
        Args: {
          p_confirm_outside_hours: boolean
          p_day: number
          p_duration: number
          p_from_date: string
          p_location: Database["public"]["Enums"]["lesson_location"]
          p_series_id: string
          p_start: string
          p_teacher_id: string
        }
        Returns: Json
      }
      check_booking: {
        Args: {
          p_duration: number
          p_lesson_type: string
          p_series: boolean
          p_start: string
          p_student: string
          p_teacher: string
        }
        Returns: undefined
      }
      claim_email_outbox: {
        Args: { p_limit: number }
        Returns: {
          attempts: number
          created_at: string
          dedupe_key: string
          id: string
          kind: string
          last_error: string | null
          locked_until: string | null
          next_attempt_at: string
          notification_id: string | null
          payload: Json
          provider_id: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["email_status"]
          to_email: string
          user_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "email_outbox"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      clear_lesson_attention: {
        Args: { p_id: string; p_version: number }
        Returns: undefined
      }
      closure_impact: {
        Args: { p_id: string }
        Returns: {
          end_at: string
          free: boolean
          lesson_id: string
          lesson_type_name: string
          start_at: string
          student_name: string
          teacher_name: string
        }[]
      }
      closure_on: { Args: { p_date: string }; Returns: boolean }
      complete_email_outbox: {
        Args: {
          p_error: string
          p_id: string
          p_provider_id: string
          p_result: string
        }
        Returns: undefined
      }
      create_invitation: {
        Args: {
          p_email: string
          p_full_name: string
          p_role: Database["public"]["Enums"]["invitation_role"]
          p_teacher_id: string
          p_token_hash: string
        }
        Returns: string
      }
      create_series: {
        Args: {
          p_confirm_outside_hours: boolean
          p_end_date: string
          p_lesson_type_id: string
          p_location: Database["public"]["Enums"]["lesson_location"]
          p_meetings: Json
          p_start_date: string
          p_student_id: string
        }
        Returns: Json
      }
      current_teacher_id: { Args: never; Returns: string }
      current_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      decide_availability_request: {
        Args: {
          p_approve: boolean
          p_decisions?: Json
          p_id: string
          p_note: string
          p_version: number
        }
        Returns: Json
      }
      decide_lesson_change_request: {
        Args: {
          p_approve: boolean
          p_confirm_held?: boolean
          p_counter_date?: string
          p_counter_start?: string
          p_id: string
          p_note: string
          p_version: number
        }
        Returns: undefined
      }
      delete_lesson_type: {
        Args: { p_id: string; p_remove_from_teachers: boolean }
        Returns: undefined
      }
      delete_student: { Args: { p_id: string }; Returns: undefined }
      delete_student_history: { Args: { p_id: string }; Returns: number }
      delete_teacher: { Args: { p_id: string }; Returns: undefined }
      delete_teacher_history: { Args: { p_id: string }; Returns: number }
      discard_pending_requests: {
        Args: { p_lesson_id: string; p_series_id: string }
        Returns: number
      }
      dispatch_due_reminders: { Args: never; Returns: number }
      do_cancel_lesson: {
        Args: {
          p_lesson_id: string
          p_reason: string
          p_source: Database["public"]["Enums"]["cancel_source"]
        }
        Returns: undefined
      }
      do_restore_lesson: {
        Args: {
          p_date: string
          p_lesson_id: string
          p_outside: boolean
          p_start: string
        }
        Returns: undefined
      }
      do_update_lesson: {
        Args: {
          p_date: string
          p_duration: number
          p_lesson_id: string
          p_location: Database["public"]["Enums"]["lesson_location"]
          p_outside_hours: boolean
          p_start: string
          p_teacher: string
        }
        Returns: undefined
      }
      email_in_use: {
        Args: { p_email: string; p_except_teacher?: string }
        Returns: boolean
      }
      expire_exception_requests: { Args: never; Returns: number }
      expire_lesson_change_requests: { Args: never; Returns: number }
      expire_pending_requests: { Args: never; Returns: number }
      extend_recurring_lessons: { Args: never; Returns: number }
      extend_series: {
        Args: { p_end_date: string; p_resume_from: string; p_series_id: string }
        Returns: Json
      }
      flag_availability_impact: {
        Args: { p_request_id: string }
        Returns: number
      }
      generate_series_occurrences: {
        Args: { p_series_id: string; p_until: string }
        Returns: Json
      }
      get_lesson: {
        Args: { p_id: string }
        Returns: {
          attendance_note: string
          attendance_status: Database["public"]["Enums"]["attendance_status"]
          attendance_updated_at: string
          attendance_updated_by_name: string
          attendance_version: number
          attention_reason: Database["public"]["Enums"]["attention_reason"]
          cancel_reason: string
          cancel_source: Database["public"]["Enums"]["cancel_source"]
          cancelled_at: string
          color: string
          duration_minutes: number
          end_at: string
          id: string
          is_substitute: boolean
          lesson_type_id: string
          lesson_type_name: string
          location: Database["public"]["Enums"]["lesson_location"]
          occurrence_date: string
          outside_hours: boolean
          pending_change_request_id: string
          pending_change_request_kind: Database["public"]["Enums"]["lesson_change_kind"]
          requires_attention: boolean
          series_day: number
          series_end_date: string
          series_id: string
          series_start_time: string
          series_status: Database["public"]["Enums"]["series_status"]
          start_at: string
          status: Database["public"]["Enums"]["lesson_status"]
          student_id: string
          student_name: string
          teacher_id: string
          teacher_name: string
          version: number
        }[]
      }
      inactive_teacher_id: { Args: never; Returns: string }
      is_admin: { Args: never; Returns: boolean }
      is_my_student: { Args: { p_student_id: string }; Returns: boolean }
      is_quarter_hour: { Args: { p_time: string }; Returns: boolean }
      job_finish: {
        Args: { p_job: string; p_ok: boolean; p_summary: Json }
        Returns: undefined
      }
      lesson_conflict: {
        Args: {
          p_end: string
          p_start: string
          p_student: string
          p_teacher: string
        }
        Returns: string
      }
      lesson_conflict_except: {
        Args: {
          p_end: string
          p_exclude: string
          p_start: string
          p_student: string
          p_teacher: string
        }
        Returns: string
      }
      lesson_notice: {
        Args: { p_lesson: Database["public"]["Tables"]["lessons"]["Row"] }
        Returns: Json
      }
      lesson_snapshot: {
        Args: { p_lesson: Database["public"]["Tables"]["lessons"]["Row"] }
        Returns: Json
      }
      lesson_type_delete_info: { Args: { p_id: string }; Returns: Json }
      lesson_type_duration_impact: {
        Args: { p_id: string; p_new_duration: number }
        Returns: Json
      }
      list_attention_lessons: {
        Args: never
        Returns: {
          attention_reason: Database["public"]["Enums"]["attention_reason"]
          color: string
          end_at: string
          id: string
          lesson_type_name: string
          series_id: string
          start_at: string
          student_name: string
          teacher_name: string
          version: number
        }[]
      }
      list_audit_events: {
        Args: { p_from: string; p_kind: string; p_offset: number; p_to: string }
        Returns: {
          action: string
          actor_name: string
          created_at: string
          entity: string
          entity_id: string
          id: string
          lesson_start_at: string
          new_values: Json
          old_values: Json
          student_name: string
          teacher_name: string
          total: number
        }[]
      }
      list_calendar_lessons: {
        Args: {
          p_attention_only?: boolean
          p_from: string
          p_include_cancelled: boolean
          p_lesson_type_id: string
          p_student_id: string
          p_teacher_id: string
          p_to: string
        }
        Returns: {
          attendance_status: Database["public"]["Enums"]["attendance_status"]
          attention_reason: Database["public"]["Enums"]["attention_reason"]
          color: string
          end_at: string
          id: string
          lesson_type_id: string
          lesson_type_name: string
          location: Database["public"]["Enums"]["lesson_location"]
          requires_attention: boolean
          series_id: string
          start_at: string
          status: Database["public"]["Enums"]["lesson_status"]
          student_id: string
          student_name: string
          teacher_id: string
          teacher_name: string
        }[]
      }
      list_deleted_people: {
        Args: { p_kind: string }
        Returns: {
          days_left: number
          deleted_at: string
          full_name: string
          id: string
          lessons: number
          purge_after: string
          purged: boolean
        }[]
      }
      list_exception_requests: {
        Args: { p_pending_only: boolean }
        Returns: {
          color: string
          created_at: string
          decided_at: string
          decision_note: string
          duration_minutes: number
          end_date: string
          id: string
          kind: Database["public"]["Enums"]["exception_request_kind"]
          lesson_type_name: string
          location: Database["public"]["Enums"]["lesson_location"]
          outside_hours: boolean
          result_note: string
          start_date: string
          start_time: string
          status: Database["public"]["Enums"]["exception_request_status"]
          student_name: string
          teacher_id: string
          teacher_name: string
          version: number
        }[]
      }
      list_history_lessons: {
        Args: {
          p_from: string
          p_student_id: string
          p_teacher_id: string
          p_to: string
        }
        Returns: {
          attendance_note: string
          attendance_status: Database["public"]["Enums"]["attendance_status"]
          attendance_version: number
          color: string
          end_at: string
          id: string
          lesson_type_name: string
          location: Database["public"]["Enums"]["lesson_location"]
          start_at: string
          status: Database["public"]["Enums"]["lesson_status"]
          student_id: string
          student_name: string
          teacher_id: string
          teacher_name: string
          version: number
        }[]
      }
      list_lesson_change_requests: {
        Args: { p_pending_only: boolean }
        Returns: {
          color: string
          created_at: string
          decided_at: string
          decision_note: string
          id: string
          kind: Database["public"]["Enums"]["lesson_change_kind"]
          lesson_end_at: string
          lesson_id: string
          lesson_location: Database["public"]["Enums"]["lesson_location"]
          lesson_start_at: string
          lesson_status: Database["public"]["Enums"]["lesson_status"]
          lesson_type_name: string
          lesson_version: number
          proposed_date: string
          proposed_start_time: string
          reason: string
          status: Database["public"]["Enums"]["request_status"]
          student_name: string
          teacher_id: string
          teacher_name: string
          version: number
        }[]
      }
      list_lesson_history: {
        Args: { p_lesson_id: string }
        Returns: {
          action: string
          actor_name: string
          created_at: string
          id: string
          new_values: Json
          old_values: Json
        }[]
      }
      list_notifications: {
        Args: { p_offset: number; p_tab: string }
        Returns: {
          archived_at: string
          category: Database["public"]["Enums"]["notification_category"]
          created_at: string
          entity: string
          entity_id: string
          id: string
          payload: Json
          read_at: string
          subject_name: string
          total: number
          type: string
        }[]
      }
      list_open_invitations: {
        Args: never
        Returns: {
          email: string
          expires_at: string
          full_name: string
          id: string
          role: Database["public"]["Enums"]["invitation_role"]
          teacher_id: string
        }[]
      }
      list_recent_changes: {
        Args: { p_limit: number }
        Returns: {
          action: string
          actor_name: string
          created_at: string
          entity: string
          entity_id: string
          id: string
          lesson_start_at: string
          new_values: Json
          old_values: Json
          student_name: string
          teacher_name: string
        }[]
      }
      list_substitutes: {
        Args: { p_lesson_id: string }
        Returns: {
          available: boolean
          teacher_id: string
          teacher_name: string
        }[]
      }
      list_teacher_names: {
        Args: never
        Returns: {
          full_name: string
          id: string
        }[]
      }
      list_unreported_lessons: {
        Args: { p_limit: number }
        Returns: {
          color: string
          end_at: string
          id: string
          lesson_type_name: string
          start_at: string
          student_name: string
          teacher_name: string
          total: number
        }[]
      }
      local_ts: { Args: { p_date: string; p_time: string }; Returns: string }
      log_event: {
        Args: {
          p_action: string
          p_entity: string
          p_entity_id: string
          p_new: Json
          p_old: Json
        }
        Returns: undefined
      }
      log_export: {
        Args: { p_kind: string; p_rows: number }
        Returns: undefined
      }
      mark_all_notifications_read: { Args: never; Returns: number }
      mark_notifications_read: { Args: { p_ids: string[] }; Returns: number }
      notify: {
        Args: {
          p_category: Database["public"]["Enums"]["notification_category"]
          p_coalesce?: boolean
          p_dedupe?: string
          p_entity: string
          p_entity_id: string
          p_payload: Json
          p_type: string
          p_user: string
        }
        Returns: string
      }
      notify_admins: {
        Args: {
          p_category: Database["public"]["Enums"]["notification_category"]
          p_coalesce?: boolean
          p_dedupe?: string
          p_entity: string
          p_entity_id: string
          p_exclude?: string
          p_payload: Json
          p_type: string
        }
        Returns: number
      }
      notify_unreported_attendance: { Args: never; Returns: number }
      overlap_error: { Args: { p_constraint: string }; Returns: string }
      person_maintenance_on: { Args: never; Returns: undefined }
      pick_lesson_type_color: { Args: { p_palette: string[] }; Returns: string }
      ping_email_dispatcher: { Args: never; Returns: boolean }
      preview_lesson_change: {
        Args: {
          p_date: string
          p_duration: number
          p_lesson_id: string
          p_start: string
          p_teacher_id: string
        }
        Returns: Json
      }
      preview_series: {
        Args: {
          p_end_date: string
          p_lesson_type_id: string
          p_meetings: Json
          p_start_date: string
          p_student_id: string
        }
        Returns: Json
      }
      preview_series_change: {
        Args: {
          p_day: number
          p_duration: number
          p_from_date: string
          p_location: Database["public"]["Enums"]["lesson_location"]
          p_series_id: string
          p_start: string
          p_teacher_id: string
        }
        Returns: Json
      }
      preview_series_extend: {
        Args: { p_end_date: string; p_resume_from: string; p_series_id: string }
        Returns: Json
      }
      purge_soft_deleted_records: { Args: never; Returns: number }
      purge_student: { Args: { p_id: string }; Returns: undefined }
      purge_teacher: { Args: { p_id: string }; Returns: undefined }
      remove_availability: {
        Args: {
          p_availability_id: string
          p_date: string
          p_kind: Database["public"]["Enums"]["availability_request_kind"]
          p_reason: string
        }
        Returns: string
      }
      remove_student_subject: { Args: { p_id: string }; Returns: undefined }
      report_absence: {
        Args: {
          p_end_date: string
          p_end_time: string
          p_reason: string
          p_start_date: string
          p_start_time: string
          p_teacher_id: string
        }
        Returns: string
      }
      report_lessons_summary: {
        Args: {
          p_from: string
          p_group: string
          p_teacher_id: string
          p_to: string
        }
        Returns: {
          cancelled: number
          closed_day: number
          group_id: string
          group_name: string
          held: number
          scheduled_total: number
          student_absent: number
          teacher_absent: number
          unreported: number
          upcoming: number
        }[]
      }
      request_lesson_change: {
        Args: {
          p_date: string
          p_kind: Database["public"]["Enums"]["lesson_change_kind"]
          p_lesson_id: string
          p_reason: string
          p_start: string
        }
        Returns: string
      }
      require_admin: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      require_super_admin: { Args: never; Returns: undefined }
      respond_exception_request: {
        Args: {
          p_approve: boolean
          p_id: string
          p_note: string
          p_version: number
        }
        Returns: Json
      }
      restore_lesson: {
        Args: {
          p_confirm_outside_hours: boolean
          p_date: string
          p_id: string
          p_start: string
          p_version: number
        }
        Returns: Json
      }
      restore_student: {
        Args: {
          p_id: string
          p_status: Database["public"]["Enums"]["user_status"]
        }
        Returns: undefined
      }
      restore_teacher: {
        Args: {
          p_availability_mode: string
          p_id: string
          p_status: Database["public"]["Enums"]["user_status"]
        }
        Returns: undefined
      }
      revoke_invitation: {
        Args: { p_invitation_id: string }
        Returns: undefined
      }
      save_closure: {
        Args: {
          p_end_date: string
          p_holiday_key: string
          p_name: string
          p_start_date: string
        }
        Returns: string
      }
      save_reminder_preferences: {
        Args: { p_enabled: boolean; p_offsets: number[] }
        Returns: undefined
      }
      save_student: {
        Args: {
          p_birth_date: string
          p_email: string
          p_full_name: string
          p_id: string
          p_parent_email: string
          p_parent_name: string
          p_parent_phone: string
          p_phone: string
        }
        Returns: string
      }
      save_student_subject: {
        Args: {
          p_background: string
          p_id: string
          p_lesson_type_id: string
          p_level: Database["public"]["Enums"]["student_level"]
          p_student_id: string
          p_teacher_id: string
        }
        Returns: string
      }
      save_teacher: {
        Args: {
          p_email: string
          p_full_name: string
          p_id: string
          p_lesson_type_ids: string[]
          p_phone: string
        }
        Returns: string
      }
      school_today: { Args: never; Returns: string }
      series_extend_plan: {
        Args: { p_from: string; p_series: string; p_until: string }
        Returns: {
          action: string
          lesson_id: string
          occurrence_date: string
          reason: string
        }[]
      }
      series_move_plan: {
        Args: {
          p_check_availability: boolean
          p_day: number
          p_duration: number
          p_from: string
          p_series: string
          p_start: string
          p_teacher: string
        }
        Returns: {
          lesson_id: string
          new_date: string
          new_end: string
          new_start: string
          old_start: string
          outcome: string
        }[]
      }
      series_plan: {
        Args: {
          p_check_availability: boolean
          p_day: number
          p_duration: number
          p_from: string
          p_start: string
          p_student: string
          p_teacher: string
          p_until: string
        }
        Returns: {
          end_at: string
          occurrence_date: string
          outcome: string
          start_at: string
        }[]
      }
      series_window_end: { Args: { p_end_date: string }; Returns: string }
      set_admin_permissions: {
        Args: { p_delete_student_history: boolean; p_profile_id: string }
        Returns: undefined
      }
      set_admin_status: {
        Args: {
          p_profile_id: string
          p_status: Database["public"]["Enums"]["user_status"]
        }
        Returns: undefined
      }
      set_attendance: {
        Args: {
          p_lesson_id: string
          p_note: string
          p_status: Database["public"]["Enums"]["attendance_status"]
          p_version?: number
        }
        Returns: undefined
      }
      set_lesson_reminder: {
        Args: { p_lesson: string; p_mode: string; p_offsets: number[] }
        Returns: undefined
      }
      set_notification_channel: {
        Args: { p_channel: Database["public"]["Enums"]["notification_channel"] }
        Returns: undefined
      }
      set_operating_hours: { Args: { p_days: Json }; Returns: number }
      set_student_status: {
        Args: {
          p_id: string
          p_return_date: string
          p_return_mode: Database["public"]["Enums"]["student_return_mode"]
          p_status: Database["public"]["Enums"]["user_status"]
        }
        Returns: undefined
      }
      set_teacher_status: {
        Args: {
          p_availability_mode?: string
          p_status: Database["public"]["Enums"]["user_status"]
          p_teacher_id: string
        }
        Returns: undefined
      }
      slot_problem: {
        Args: {
          p_check_availability: boolean
          p_date: string
          p_duration: number
          p_exclude: string
          p_start: string
          p_student: string
          p_teacher: string
        }
        Returns: string
      }
      split_series: {
        Args: {
          p_check_availability: boolean
          p_day: number
          p_duration: number
          p_from: string
          p_location: Database["public"]["Enums"]["lesson_location"]
          p_request: string
          p_series: string
          p_start: string
          p_teacher: string
        }
        Returns: Json
      }
      stop_series: {
        Args: { p_from_date: string; p_series_id: string }
        Returns: Json
      }
      student_status_impact: { Args: { p_id: string }; Returns: Json }
      subject_has_lessons: {
        Args: { p_lesson_type: string; p_student: string }
        Returns: boolean
      }
      suggest_slots: {
        Args: {
          p_date: string
          p_duration: number
          p_exclude: string
          p_student: string
          p_teacher: string
        }
        Returns: {
          start_time: string
        }[]
      }
      teacher_covers: {
        Args: {
          p_date: string
          p_end: string
          p_include_absences: boolean
          p_start: string
          p_teacher: string
        }
        Returns: boolean
      }
      teacher_profile_id: { Args: { p_teacher: string }; Returns: string }
      teacher_status_impact: { Args: { p_id: string }; Returns: Json }
      transfer_super_admin: {
        Args: { p_target_profile_id: string }
        Returns: undefined
      }
      unarchive_notifications: { Args: { p_ids: string[] }; Returns: number }
      update_lesson: {
        Args: {
          p_change_request_id: string
          p_confirm_outside_hours: boolean
          p_date: string
          p_duration: number
          p_id: string
          p_location: Database["public"]["Enums"]["lesson_location"]
          p_start: string
          p_teacher_id: string
          p_version: number
        }
        Returns: Json
      }
      update_own_profile: {
        Args: { p_full_name: string; p_phone: string }
        Returns: undefined
      }
      update_professional_info: {
        Args: {
          p_background: string
          p_id: string
          p_level: Database["public"]["Enums"]["student_level"]
        }
        Returns: undefined
      }
      valid_reminder_offsets: { Args: { p: number[] }; Returns: boolean }
      within_operating_hours: {
        Args: { p_day: number; p_end: string; p_start: string }
        Returns: boolean
      }
    }
    Enums: {
      attendance_status: "held" | "student_absent" | "teacher_absent"
      attention_reason:
        | "outside_hours"
        | "teacher_inactive"
        | "teacher_absent"
        | "availability_removed"
        | "series_change_conflict"
      availability_request_kind: "remove_weekly" | "remove_once" | "absence"
      cancel_source:
        | "admin"
        | "teacher_request"
        | "student_inactive"
        | "series_stopped"
        | "closure_removed"
      closure_source: "holiday" | "custom"
      closure_status: "active" | "cancelled"
      email_status:
        | "pending"
        | "sending"
        | "sent"
        | "failed"
        | "skipped_test_mode"
      exception_request_kind:
        | "single"
        | "series"
        | "lesson_change"
        | "series_change"
        | "restore"
      exception_request_status:
        | "pending"
        | "approved"
        | "rejected"
        | "expired"
        | "cannot_schedule"
        | "cancelled"
      invitation_role: "admin" | "teacher"
      lesson_change_kind: "cancel" | "change"
      lesson_location: "school" | "zoom"
      lesson_status: "scheduled" | "cancelled" | "closed_day"
      notification_category: "activity" | "system"
      notification_channel: "in_app" | "in_app_email"
      reminder_mode: "off" | "custom"
      request_status: "pending" | "approved" | "rejected" | "cancelled"
      series_status: "active" | "ended"
      student_level: "beginner" | "intermediate" | "advanced"
      student_return_mode: "notify" | "auto"
      user_role: "super_admin" | "admin" | "teacher"
      user_status: "active" | "inactive"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      attendance_status: ["held", "student_absent", "teacher_absent"],
      attention_reason: [
        "outside_hours",
        "teacher_inactive",
        "teacher_absent",
        "availability_removed",
        "series_change_conflict",
      ],
      availability_request_kind: ["remove_weekly", "remove_once", "absence"],
      cancel_source: [
        "admin",
        "teacher_request",
        "student_inactive",
        "series_stopped",
        "closure_removed",
      ],
      closure_source: ["holiday", "custom"],
      closure_status: ["active", "cancelled"],
      email_status: [
        "pending",
        "sending",
        "sent",
        "failed",
        "skipped_test_mode",
      ],
      exception_request_kind: [
        "single",
        "series",
        "lesson_change",
        "series_change",
        "restore",
      ],
      exception_request_status: [
        "pending",
        "approved",
        "rejected",
        "expired",
        "cannot_schedule",
        "cancelled",
      ],
      invitation_role: ["admin", "teacher"],
      lesson_change_kind: ["cancel", "change"],
      lesson_location: ["school", "zoom"],
      lesson_status: ["scheduled", "cancelled", "closed_day"],
      notification_category: ["activity", "system"],
      notification_channel: ["in_app", "in_app_email"],
      reminder_mode: ["off", "custom"],
      request_status: ["pending", "approved", "rejected", "cancelled"],
      series_status: ["active", "ended"],
      student_level: ["beginner", "intermediate", "advanced"],
      student_return_mode: ["notify", "auto"],
      user_role: ["super_admin", "admin", "teacher"],
      user_status: ["active", "inactive"],
    },
  },
} as const
