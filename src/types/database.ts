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
      current_teacher_id: { Args: never; Returns: string }
      current_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      email_in_use: {
        Args: { p_email: string; p_except_teacher?: string }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
      is_my_student: { Args: { p_student_id: string }; Returns: boolean }
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
      pick_lesson_type_color: { Args: { p_palette: string[] }; Returns: string }
      remove_student_subject: { Args: { p_id: string }; Returns: undefined }
      require_admin: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      require_super_admin: { Args: never; Returns: undefined }
      revoke_invitation: {
        Args: { p_invitation_id: string }
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
    }
    Enums: {
      invitation_role: "admin" | "teacher"
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
      invitation_role: ["admin", "teacher"],
      student_level: ["beginner", "intermediate", "advanced"],
      student_return_mode: ["notify", "auto"],
      user_role: ["super_admin", "admin", "teacher"],
      user_status: ["active", "inactive"],
    },
  },
} as const
