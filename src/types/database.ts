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
      exception_booking_requests: {
        Row: {
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
          teacher_id: string
          updated_at: string
          version: number
        }
        Insert: {
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
          teacher_id: string
          updated_at?: string
          version?: number
        }
        Update: {
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
          birth_date: string
          created_at: string
          expected_return_date: string | null
          full_name: string
          id: string
          return_mode: Database["public"]["Enums"]["student_return_mode"] | null
          status: Database["public"]["Enums"]["user_status"]
          updated_at: string
        }
        Insert: {
          birth_date: string
          created_at?: string
          expected_return_date?: string | null
          full_name: string
          id?: string
          return_mode?:
            | Database["public"]["Enums"]["student_return_mode"]
            | null
          status?: Database["public"]["Enums"]["user_status"]
          updated_at?: string
        }
        Update: {
          birth_date?: string
          created_at?: string
          expected_return_date?: string | null
          full_name?: string
          id?: string
          return_mode?:
            | Database["public"]["Enums"]["student_return_mode"]
            | null
          status?: Database["public"]["Enums"]["user_status"]
          updated_at?: string
        }
        Relationships: []
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
          created_at: string
          email: string
          full_name: string
          id: string
          phone: string | null
          profile_id: string | null
          status: Database["public"]["Enums"]["user_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          full_name: string
          id?: string
          phone?: string | null
          profile_id?: string | null
          status?: Database["public"]["Enums"]["user_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          phone?: string | null
          profile_id?: string | null
          status?: Database["public"]["Enums"]["user_status"]
          updated_at?: string
        }
        Relationships: [
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
      add_availability: {
        Args: {
          p_day: number
          p_end: string
          p_start: string
          p_teacher_id: string
        }
        Returns: string
      }
      apply_availability_request: {
        Args: { p_request_id: string }
        Returns: undefined
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
      cancel_availability_request: {
        Args: { p_id: string; p_version: number }
        Returns: undefined
      }
      cancel_closure: { Args: { p_id: string }; Returns: undefined }
      cancel_exception_request: {
        Args: { p_id: string; p_version: number }
        Returns: undefined
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
      closure_on: { Args: { p_date: string }; Returns: boolean }
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
      email_in_use: {
        Args: { p_email: string; p_except_teacher?: string }
        Returns: boolean
      }
      expire_exception_requests: { Args: never; Returns: number }
      generate_series_occurrences: {
        Args: { p_series_id: string; p_until: string }
        Returns: Json
      }
      get_lesson: {
        Args: { p_id: string }
        Returns: {
          color: string
          end_at: string
          id: string
          is_substitute: boolean
          lesson_type_name: string
          location: Database["public"]["Enums"]["lesson_location"]
          outside_hours: boolean
          series_day: number
          series_end_date: string
          series_id: string
          series_start_time: string
          start_at: string
          status: Database["public"]["Enums"]["lesson_status"]
          student_id: string
          student_name: string
          teacher_id: string
          teacher_name: string
        }[]
      }
      is_admin: { Args: never; Returns: boolean }
      is_my_student: { Args: { p_student_id: string }; Returns: boolean }
      is_quarter_hour: { Args: { p_time: string }; Returns: boolean }
      lesson_conflict: {
        Args: {
          p_end: string
          p_start: string
          p_student: string
          p_teacher: string
        }
        Returns: string
      }
      lesson_type_delete_info: { Args: { p_id: string }; Returns: Json }
      list_calendar_lessons: {
        Args: {
          p_from: string
          p_include_cancelled: boolean
          p_lesson_type_id: string
          p_student_id: string
          p_teacher_id: string
          p_to: string
        }
        Returns: {
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
      list_teacher_names: {
        Args: never
        Returns: {
          full_name: string
          id: string
        }[]
      }
      local_ts: { Args: { p_date: string; p_time: string }; Returns: string }
      overlap_error: { Args: { p_constraint: string }; Returns: string }
      pick_lesson_type_color: { Args: { p_palette: string[] }; Returns: string }
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
          p_status: Database["public"]["Enums"]["user_status"]
          p_teacher_id: string
        }
        Returns: undefined
      }
      subject_has_lessons: {
        Args: { p_lesson_type: string; p_student: string }
        Returns: boolean
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
      transfer_super_admin: {
        Args: { p_target_profile_id: string }
        Returns: undefined
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
      within_operating_hours: {
        Args: { p_day: number; p_end: string; p_start: string }
        Returns: boolean
      }
    }
    Enums: {
      availability_request_kind: "remove_weekly" | "remove_once" | "absence"
      closure_source: "holiday" | "custom"
      closure_status: "active" | "cancelled"
      exception_request_kind: "single" | "series"
      exception_request_status:
        | "pending"
        | "approved"
        | "rejected"
        | "expired"
        | "cannot_schedule"
        | "cancelled"
      invitation_role: "admin" | "teacher"
      lesson_location: "school" | "zoom"
      lesson_status: "scheduled" | "cancelled" | "closed_day"
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
      availability_request_kind: ["remove_weekly", "remove_once", "absence"],
      closure_source: ["holiday", "custom"],
      closure_status: ["active", "cancelled"],
      exception_request_kind: ["single", "series"],
      exception_request_status: [
        "pending",
        "approved",
        "rejected",
        "expired",
        "cannot_schedule",
        "cancelled",
      ],
      invitation_role: ["admin", "teacher"],
      lesson_location: ["school", "zoom"],
      lesson_status: ["scheduled", "cancelled", "closed_day"],
      request_status: ["pending", "approved", "rejected", "cancelled"],
      series_status: ["active", "ended"],
      student_level: ["beginner", "intermediate", "advanced"],
      student_return_mode: ["notify", "auto"],
      user_role: ["super_admin", "admin", "teacher"],
      user_status: ["active", "inactive"],
    },
  },
} as const
