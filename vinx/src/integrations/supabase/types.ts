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
      channel_links: {
        Row: {
          channel: string
          created_at: string
          display_name: string | null
          external_id: string
          id: string
          paused: boolean
          user_id: string
        }
        Insert: never
        Update: never
        Relationships: []
      }
      device_tokens: {
        Row: {
          created_at: string
          id: string
          last_used_at: string | null
          name: string
          revoked_at: string | null
          token_hash: string
          token_prefix: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_used_at?: string | null
          name: string
          revoked_at?: string | null
          token_hash: string
          token_prefix: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_used_at?: string | null
          name?: string
          revoked_at?: string | null
          token_hash?: string
          token_prefix?: string
          user_id?: string
        }
        Relationships: []
      }
      entities: {
        Row: {
          attributes: Json | null
          created_at: string
          entity_type: string
          first_seen_at: string
          id: string
          last_seen_at: string
          mention_count: number | null
          name: string
          user_id: string
        }
        Insert: {
          attributes?: Json | null
          created_at?: string
          entity_type: string
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          mention_count?: number | null
          name: string
          user_id: string
        }
        Update: {
          attributes?: Json | null
          created_at?: string
          entity_type?: string
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          mention_count?: number | null
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      entity_relationships: {
        Row: {
          context: string | null
          entity_a_id: string
          entity_b_id: string
          first_seen_at: string
          id: string
          last_seen_at: string
          relationship_type: string
          strength: number | null
          user_id: string
        }
        Insert: {
          context?: string | null
          entity_a_id: string
          entity_b_id: string
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          relationship_type: string
          strength?: number | null
          user_id: string
        }
        Update: {
          context?: string | null
          entity_a_id?: string
          entity_b_id?: string
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          relationship_type?: string
          strength?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "entity_relationships_entity_a_id_fkey"
            columns: ["entity_a_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entity_relationships_entity_b_id_fkey"
            columns: ["entity_b_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
        ]
      }
      ingestion_queue: {
        Row: {
          app_package: string | null
          attempts: number
          capture_type: string | null
          client_timestamp: string | null
          content_hash: string
          created_at: string
          id: string
          last_error: string | null
          locked_at: string | null
          metadata: Json | null
          platform: string | null
          raw_content: string
          source_app: string | null
          status: string
          user_id: string
        }
        Insert: {
          app_package?: string | null
          attempts?: number
          capture_type?: string | null
          client_timestamp?: string | null
          content_hash: string
          created_at?: string
          id?: string
          last_error?: string | null
          locked_at?: string | null
          metadata?: Json | null
          platform?: string | null
          raw_content: string
          source_app?: string | null
          status?: string
          user_id: string
        }
        Update: {
          app_package?: string | null
          attempts?: number
          capture_type?: string | null
          client_timestamp?: string | null
          content_hash?: string
          created_at?: string
          id?: string
          last_error?: string | null
          locked_at?: string | null
          metadata?: Json | null
          platform?: string | null
          raw_content?: string
          source_app?: string | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      memory_vectors: {
        Row: {
          app_package: string | null
          capture_type: string | null
          content_text: string
          created_at: string
          embedding: string | null
          embedding_model: string | null
          embedding_text: string | null
          fts: unknown
          id: string
          platform: string | null
          raw_memory_id: string | null
          structured_event_id: string | null
          user_id: string
        }
        Insert: {
          app_package?: string | null
          capture_type?: string | null
          content_text: string
          created_at?: string
          embedding?: string | null
          embedding_model?: string | null
          embedding_text?: string | null
          fts?: unknown
          id?: string
          platform?: string | null
          raw_memory_id?: string | null
          structured_event_id?: string | null
          user_id: string
        }
        Update: {
          app_package?: string | null
          capture_type?: string | null
          content_text?: string
          created_at?: string
          embedding?: string | null
          embedding_model?: string | null
          embedding_text?: string | null
          fts?: unknown
          id?: string
          platform?: string | null
          raw_memory_id?: string | null
          structured_event_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memory_vectors_raw_memory_id_fkey"
            columns: ["raw_memory_id"]
            isOneToOne: false
            referencedRelation: "raw_memories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memory_vectors_structured_event_id_fkey"
            columns: ["structured_event_id"]
            isOneToOne: false
            referencedRelation: "structured_events"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_intents: {
        Row: {
          created_at: string
          id: string
          intent_text: string
          priority: number | null
          raw_memory_id: string | null
          reminded_at: string | null
          resolved_at: string | null
          status: Database["public"]["Enums"]["intent_status"]
          structured_event_id: string | null
          trigger_date: string | null
          trigger_type: string
          trigger_value: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          intent_text: string
          priority?: number | null
          raw_memory_id?: string | null
          reminded_at?: string | null
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["intent_status"]
          structured_event_id?: string | null
          trigger_date?: string | null
          trigger_type: string
          trigger_value?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          intent_text?: string
          priority?: number | null
          raw_memory_id?: string | null
          reminded_at?: string | null
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["intent_status"]
          structured_event_id?: string | null
          trigger_date?: string | null
          trigger_type?: string
          trigger_value?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pending_intents_raw_memory_id_fkey"
            columns: ["raw_memory_id"]
            isOneToOne: false
            referencedRelation: "raw_memories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_intents_structured_event_id_fkey"
            columns: ["structured_event_id"]
            isOneToOne: false
            referencedRelation: "structured_events"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          brief_hour: number
          created_at: string
          daily_brief_enabled: boolean
          display_name: string | null
          id: string
          last_brief_sent_on: string | null
          reminders_enabled: boolean
          timezone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          brief_hour?: number
          created_at?: string
          daily_brief_enabled?: boolean
          display_name?: string | null
          id: string
          last_brief_sent_on?: string | null
          reminders_enabled?: boolean
          timezone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          brief_hour?: number
          created_at?: string
          daily_brief_enabled?: boolean
          display_name?: string | null
          id?: string
          last_brief_sent_on?: string | null
          reminders_enabled?: boolean
          timezone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          last_used_at: string | null
          p256dh: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          last_used_at?: string | null
          p256dh: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          last_used_at?: string | null
          p256dh?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      raw_memories: {
        Row: {
          app_package: string | null
          capture_type: string | null
          captured_at: string
          created_at: string
          id: string
          last_attempt_at: string | null
          media_url: string | null
          process_attempts: number
          metadata: Json | null
          platform: string | null
          raw_content: string
          source: Database["public"]["Enums"]["memory_source"]
          status: Database["public"]["Enums"]["memory_status"]
          user_id: string
        }
        Insert: {
          app_package?: string | null
          capture_type?: string | null
          captured_at?: string
          created_at?: string
          id?: string
          last_attempt_at?: string | null
          media_url?: string | null
          process_attempts?: number
          metadata?: Json | null
          platform?: string | null
          raw_content: string
          source?: Database["public"]["Enums"]["memory_source"]
          status?: Database["public"]["Enums"]["memory_status"]
          user_id: string
        }
        Update: {
          app_package?: string | null
          capture_type?: string | null
          captured_at?: string
          created_at?: string
          id?: string
          last_attempt_at?: string | null
          media_url?: string | null
          process_attempts?: number
          metadata?: Json | null
          platform?: string | null
          raw_content?: string
          source?: Database["public"]["Enums"]["memory_source"]
          status?: Database["public"]["Enums"]["memory_status"]
          user_id?: string
        }
        Relationships: []
      }
      structured_events: {
        Row: {
          confidence_score: number | null
          created_at: string
          emotional_tone: string | null
          event_date: string | null
          id: string
          is_private: boolean | null
          location: string | null
          participants: string[] | null
          raw_memory_id: string | null
          salience_score: number | null
          summary: string | null
          title: string
          topics: string[] | null
          user_id: string
        }
        Insert: {
          confidence_score?: number | null
          created_at?: string
          emotional_tone?: string | null
          event_date?: string | null
          id?: string
          is_private?: boolean | null
          location?: string | null
          participants?: string[] | null
          raw_memory_id?: string | null
          salience_score?: number | null
          summary?: string | null
          title: string
          topics?: string[] | null
          user_id: string
        }
        Update: {
          confidence_score?: number | null
          created_at?: string
          emotional_tone?: string | null
          event_date?: string | null
          id?: string
          is_private?: boolean | null
          location?: string | null
          participants?: string[] | null
          raw_memory_id?: string | null
          salience_score?: number | null
          summary?: string | null
          title?: string
          topics?: string[] | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "structured_events_raw_memory_id_fkey"
            columns: ["raw_memory_id"]
            isOneToOne: false
            referencedRelation: "raw_memories"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      build_brief: {
        Args: { _seed: string; _tz: string; _user_id: string }
        Returns: Json
      }
      claim_due_briefs: {
        Args: { _limit?: number }
        Returns: {
          display_name: string
          timezone: string
          user_id: string
        }[]
      }
      claim_due_intents: {
        Args: { _limit?: number }
        Returns: {
          id: string
          intent_text: string
          timezone: string
          trigger_date: string
          trigger_type: string
          trigger_value: string
          user_id: string
        }[]
      }
      claim_ingestion_batch: {
        Args: { _limit?: number }
        Returns: {
          app_package: string | null
          attempts: number
          capture_type: string | null
          client_timestamp: string | null
          content_hash: string
          created_at: string
          id: string
          last_error: string | null
          locked_at: string | null
          metadata: Json | null
          platform: string | null
          raw_content: string
          source_app: string | null
          status: string
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "ingestion_queue"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      invoke_edge_function: {
        Args: { _body?: Json; _name: string }
        Returns: number
      }
      match_memories: {
        Args: {
          _date_from?: string
          _date_to?: string
          _match_count?: number
          _query_embedding?: string
          _query_text?: string
          _user_id: string
        }
        Returns: {
          captured_at: string
          content_text: string
          event_date: string
          media_url: string
          raw_memory_id: string
          score: number
          source: Database["public"]["Enums"]["memory_source"]
          structured_event_id: string
          summary: string
          title: string
        }[]
      }
      register_push_subscription: {
        Args: {
          _auth: string
          _endpoint: string
          _p256dh: string
          _user_agent?: string
        }
        Returns: string
      }
      set_channel_paused: { Args: { _channel: string; _paused: boolean }; Returns: undefined }
      validate_device_token: { Args: { _token_hash: string }; Returns: string }
    }
    Enums: {
      intent_status: "pending" | "reminded" | "resolved" | "expired"
      memory_source:
        | "whatsapp"
        | "sms"
        | "email"
        | "calendar"
        | "notes"
        | "voice"
        | "image"
        | "browser"
        | "notification"
        | "manual"
      memory_status: "pending" | "processing" | "processed" | "failed"
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
      intent_status: ["pending", "reminded", "resolved", "expired"],
      memory_source: [
        "whatsapp",
        "sms",
        "email",
        "calendar",
        "notes",
        "voice",
        "image",
        "browser",
        "notification",
        "manual",
      ],
      memory_status: ["pending", "processing", "processed", "failed"],
    },
  },
} as const
