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
      kb_entries: {
        Row: {
          created_at: string
          description: string | null
          external_id: string
          id: string
          kb_type: string
          metadata: Json | null
          name: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          external_id: string
          id?: string
          kb_type: string
          metadata?: Json | null
          name: string
        }
        Update: {
          created_at?: string
          description?: string | null
          external_id?: string
          id?: string
          kb_type?: string
          metadata?: Json | null
          name?: string
        }
        Relationships: []
      }
      kg_causal_links: {
        Row: {
          causal_type: string
          cause: string
          confidence: number | null
          created_at: string
          effect: string
          evidence: string | null
          id: string
          mitre_tactic: string | null
          report_id: string | null
          temporal_order: number | null
        }
        Insert: {
          causal_type: string
          cause: string
          confidence?: number | null
          created_at?: string
          effect: string
          evidence?: string | null
          id?: string
          mitre_tactic?: string | null
          report_id?: string | null
          temporal_order?: number | null
        }
        Update: {
          causal_type?: string
          cause?: string
          confidence?: number | null
          created_at?: string
          effect?: string
          evidence?: string | null
          id?: string
          mitre_tactic?: string | null
          report_id?: string | null
          temporal_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "kg_causal_links_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "threat_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      kg_entities: {
        Row: {
          canonical_name: string
          confidence: number | null
          context: string | null
          created_at: string
          entity_type: string
          id: string
          mitre_id: string | null
          name: string
          report_id: string | null
          stix_type: string | null
        }
        Insert: {
          canonical_name: string
          confidence?: number | null
          context?: string | null
          created_at?: string
          entity_type: string
          id?: string
          mitre_id?: string | null
          name: string
          report_id?: string | null
          stix_type?: string | null
        }
        Update: {
          canonical_name?: string
          confidence?: number | null
          context?: string | null
          created_at?: string
          entity_type?: string
          id?: string
          mitre_id?: string | null
          name?: string
          report_id?: string | null
          stix_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kg_entities_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "threat_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      kg_relations: {
        Row: {
          confidence: number | null
          created_at: string
          edge_type: string | null
          evidence: string | null
          id: string
          relation: string
          report_id: string | null
          source_canonical: string
          source_name: string
          target_canonical: string
          target_name: string
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          edge_type?: string | null
          evidence?: string | null
          id?: string
          relation: string
          report_id?: string | null
          source_canonical: string
          source_name: string
          target_canonical: string
          target_name: string
        }
        Update: {
          confidence?: number | null
          created_at?: string
          edge_type?: string | null
          evidence?: string | null
          id?: string
          relation?: string
          report_id?: string | null
          source_canonical?: string
          source_name?: string
          target_canonical?: string
          target_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "kg_relations_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "threat_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      monitoring_events: {
        Row: {
          category: string
          created_at: string
          detail: string | null
          event_type: string
          id: string
          metadata: Json | null
          title: string
        }
        Insert: {
          category?: string
          created_at?: string
          detail?: string | null
          event_type: string
          id?: string
          metadata?: Json | null
          title: string
        }
        Update: {
          category?: string
          created_at?: string
          detail?: string | null
          event_type?: string
          id?: string
          metadata?: Json | null
          title?: string
        }
        Relationships: []
      }
      threat_reports: {
        Row: {
          created_at: string
          embedding: string | null
          extraction_payload: Json | null
          id: string
          source_text: string
          source_type: string | null
          summary: string | null
        }
        Insert: {
          created_at?: string
          embedding?: string | null
          extraction_payload?: Json | null
          id?: string
          source_text: string
          source_type?: string | null
          summary?: string | null
        }
        Update: {
          created_at?: string
          embedding?: string | null
          extraction_payload?: Json | null
          id?: string
          source_text?: string
          source_type?: string | null
          summary?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      fetch_subgraph: {
        Args: { entity_names: string[]; max_hops?: number }
        Returns: Json
      }
      match_threat_reports: {
        Args: {
          match_count?: number
          query_embedding: string
          similarity_threshold?: number
        }
        Returns: {
          created_at: string
          id: string
          similarity: number
          source_text: string
          summary: string
        }[]
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
