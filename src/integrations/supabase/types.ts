export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: { PostgrestVersion: "14.18" }
  public: {
    Tables: {
      ai_usage_daily: {
        Row: { count: number; kind: string; usage_day: string; user_id: string }
        Insert: { count?: number; kind: string; usage_day?: string; user_id: string }
        Update: { count?: number; kind?: string; usage_day?: string; user_id?: string }
        Relationships: []
      }
      app_collections: {
        Row: { created_at: string; name: string; project_id: string; public_ops: string[] }
        Insert: { created_at?: string; name: string; project_id: string; public_ops?: string[] }
        Update: { created_at?: string; name?: string; project_id?: string; public_ops?: string[] }
        Relationships: [
          { foreignKeyName: "app_collections_project_id_fkey"; columns: ["project_id"]; isOneToOne: false; referencedRelation: "projects"; referencedColumns: ["id"] }
        ]
      }
      app_rate_limits: {
        Row: { bucket: string; client_hash: string; hits: number; project_id: string; window_start: string }
        Insert: { bucket: string; client_hash: string; hits?: number; project_id: string; window_start: string }
        Update: { bucket?: string; client_hash?: string; hits?: number; project_id?: string; window_start?: string }
        Relationships: []
      }
      app_records: {
        Row: { collection: string; created_at: string; data: Json; id: string; owner_hash: string | null; project_id: string; updated_at: string }
        Insert: { collection: string; created_at?: string; data: Json; id?: string; owner_hash?: string | null; project_id: string; updated_at?: string }
        Update: { collection?: string; created_at?: string; data?: Json; id?: string; owner_hash?: string | null; project_id?: string; updated_at?: string }
        Relationships: []
      }
      conversations: {
        Row: { created_at: string; id: string; title: string; updated_at: string; user_id: string }
        Insert: { created_at?: string; id?: string; title?: string; updated_at?: string; user_id: string }
        Update: { created_at?: string; id?: string; title?: string; updated_at?: string; user_id?: string }
        Relationships: []
      }
      messages: {
        Row: { content: string; conversation_id: string; created_at: string; id: string; role: string; status: string; user_id: string }
        Insert: { content: string; conversation_id: string; created_at?: string; id?: string; role: string; status?: string; user_id?: string }
        Update: { content?: string; conversation_id?: string; created_at?: string; id?: string; role?: string; status?: string; user_id?: string }
        Relationships: [
          { foreignKeyName: "messages_conversation_id_fkey"; columns: ["conversation_id"]; isOneToOne: false; referencedRelation: "conversations"; referencedColumns: ["id"] }
        ]
      }
      projects: {
        Row: { created_at: string; files: Json; id: string; messages: Json; name: string; result: Json | null; updated_at: string; user_id: string; versions: Json }
        Insert: { created_at?: string; files?: Json; id?: string; messages?: Json; name?: string; result?: Json | null; updated_at?: string; user_id?: string; versions?: Json }
        Update: { created_at?: string; files?: Json; id?: string; messages?: Json; name?: string; result?: Json | null; updated_at?: string; user_id?: string; versions?: Json }
        Relationships: []
      }
      project_apps: {
        Row: { created_at: string; project_id: string; public_key: string }
        Insert: { created_at?: string; project_id: string; public_key?: string }
        Update: { created_at?: string; project_id?: string; public_key?: string }
        Relationships: [
          { foreignKeyName: "project_apps_project_id_fkey"; columns: ["project_id"]; isOneToOne: true; referencedRelation: "projects"; referencedColumns: ["id"] }
        ]
      }
      user_settings: {
        Row: { language: string; theme: string; updated_at: string; user_id: string }
        Insert: { language?: string; theme?: string; updated_at?: string; user_id?: string }
        Update: { language?: string; theme?: string; updated_at?: string; user_id?: string }
        Relationships: []
      }
    }
    Views: {
      project_summaries: {
        Row: { created_at: string | null; has_content: boolean | null; id: string | null; name: string | null; updated_at: string | null; user_id: string | null }
        Relationships: []
      }
    }
    Functions: {
      append_assistant_message: { Args: { p_content: string; p_conversation_id: string; p_status?: string }; Returns: string }
      app_hit: { Args: { p_bucket: string; p_client: string; p_limit: number; p_project: string; p_window_seconds: number }; Returns: boolean }
      app_insert_record: { Args: { p_collection: string; p_data: Json; p_max: number; p_owner_hash: string | null; p_project: string }; Returns: Json }
      rotate_app_key: { Args: { p_project_id: string }; Returns: string }
      reserve_ai_tokens: { Args: { p_user_id: string }; Returns: Json }
      settle_ai_tokens: { Args: { p_user_id: string; p_actual_tokens: number; p_hold_tokens: number }; Returns: undefined }
    }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
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
    Enums: {},
  },
} as const
