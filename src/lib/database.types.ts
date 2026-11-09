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
      accounts: {
        Row: {
          account_group: string
          apr: number | null
          archived: boolean
          created_at: string
          credit_limit_cents: number | null
          currency: string
          hidden: boolean
          id: string
          institution: string | null
          key: string
          last4: string | null
          monthly_payment_cents: number | null
          name: string
          note: string | null
          reported_balance_cents: number | null
          reported_on: string | null
          sort_order: number
          user_id: string
        }
        Insert: {
          account_group: string
          apr?: number | null
          archived?: boolean
          created_at?: string
          credit_limit_cents?: number | null
          currency?: string
          hidden?: boolean
          id?: string
          institution?: string | null
          key: string
          last4?: string | null
          monthly_payment_cents?: number | null
          name: string
          note?: string | null
          reported_balance_cents?: number | null
          reported_on?: string | null
          sort_order?: number
          user_id?: string
        }
        Update: {
          account_group?: string
          apr?: number | null
          archived?: boolean
          created_at?: string
          credit_limit_cents?: number | null
          currency?: string
          hidden?: boolean
          id?: string
          institution?: string | null
          key?: string
          last4?: string | null
          monthly_payment_cents?: number | null
          name?: string
          note?: string | null
          reported_balance_cents?: number | null
          reported_on?: string | null
          sort_order?: number
          user_id?: string
        }
        Relationships: []
      }
      balance_snapshots: {
        Row: {
          account_id: string
          amount_cents: number
          as_of: string
          created_at: string
          fx_rate: number | null
          id: string
          kind: string
          native_amount: number | null
          note: string | null
          user_id: string
        }
        Insert: {
          account_id: string
          amount_cents: number
          as_of: string
          created_at?: string
          fx_rate?: number | null
          id?: string
          kind: string
          native_amount?: number | null
          note?: string | null
          user_id?: string
        }
        Update: {
          account_id?: string
          amount_cents?: number
          as_of?: string
          created_at?: string
          fx_rate?: number | null
          id?: string
          kind?: string
          native_amount?: number | null
          note?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "balance_snapshots_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "account_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "balance_snapshots_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_line_categories: {
        Row: {
          category_id: string
          line_id: string
          user_id: string
        }
        Insert: {
          category_id: string
          line_id: string
          user_id?: string
        }
        Update: {
          category_id?: string
          line_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "budget_line_categories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_line_categories_line_id_fkey"
            columns: ["line_id"]
            isOneToOne: false
            referencedRelation: "budget_lines"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_lines: {
        Row: {
          active: boolean
          color: string | null
          created_at: string
          default_cents: number
          icon: string | null
          id: string
          key: string
          kind: string
          name: string
          sort_order: number
          user_id: string
        }
        Insert: {
          active?: boolean
          color?: string | null
          created_at?: string
          default_cents: number
          icon?: string | null
          id?: string
          key: string
          kind: string
          name: string
          sort_order?: number
          user_id?: string
        }
        Update: {
          active?: boolean
          color?: string | null
          created_at?: string
          default_cents?: number
          icon?: string | null
          id?: string
          key?: string
          kind?: string
          name?: string
          sort_order?: number
          user_id?: string
        }
        Relationships: []
      }
      budgets: {
        Row: {
          amount_cents: number
          id: string
          line_id: string
          month: string
          note: string | null
          user_id: string
        }
        Insert: {
          amount_cents: number
          id?: string
          line_id: string
          month: string
          note?: string | null
          user_id?: string
        }
        Update: {
          amount_cents?: number
          id?: string
          line_id?: string
          month?: string
          note?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "budgets_line_id_fkey"
            columns: ["line_id"]
            isOneToOne: false
            referencedRelation: "budget_lines"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          archived: boolean
          color: string | null
          created_at: string
          essential: string | null
          icon: string | null
          id: string
          key: string
          kind: string
          name: string
          parent_id: string | null
          sort_order: number
          user_id: string
        }
        Insert: {
          archived?: boolean
          color?: string | null
          created_at?: string
          essential?: string | null
          icon?: string | null
          id?: string
          key: string
          kind: string
          name: string
          parent_id?: string | null
          sort_order?: number
          user_id?: string
        }
        Update: {
          archived?: boolean
          color?: string | null
          created_at?: string
          essential?: string | null
          icon?: string | null
          id?: string
          key?: string
          kind?: string
          name?: string
          parent_id?: string | null
          sort_order?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      dismissals: {
        Row: {
          created_at: string
          key: string
          user_id: string
        }
        Insert: {
          created_at?: string
          key: string
          user_id?: string
        }
        Update: {
          created_at?: string
          key?: string
          user_id?: string
        }
        Relationships: []
      }
      imports: {
        Row: {
          created_at: string
          file_name: string | null
          id: string
          imported_count: number
          row_count: number
          skipped_count: number
          source: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          file_name?: string | null
          id?: string
          imported_count?: number
          row_count?: number
          skipped_count?: number
          source: string
          status?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          file_name?: string | null
          id?: string
          imported_count?: number
          row_count?: number
          skipped_count?: number
          source?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      income_settings: {
        Row: {
          anchor_payday: string
          employer: string | null
          frequency_days: number
          holiday_rule: string
          net_paycheque_cents: number
          updated_at: string
          user_id: string
        }
        Insert: {
          anchor_payday: string
          employer?: string | null
          frequency_days?: number
          holiday_rule?: string
          net_paycheque_cents: number
          updated_at?: string
          user_id?: string
        }
        Update: {
          anchor_payday?: string
          employer?: string | null
          frequency_days?: number
          holiday_rule?: string
          net_paycheque_cents?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      merchants: {
        Row: {
          created_at: string
          id: string
          name: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      paycheques: {
        Row: {
          actual_date: string | null
          amount_cents: number | null
          expected_date: string
          id: string
          transaction_id: string | null
          user_id: string
        }
        Insert: {
          actual_date?: string | null
          amount_cents?: number | null
          expected_date: string
          id?: string
          transaction_id?: string | null
          user_id?: string
        }
        Update: {
          actual_date?: string | null
          amount_cents?: number | null
          expected_date?: string
          id?: string
          transaction_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "paycheques_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          display_name: string | null
          emergency_pin_hash: string | null
          last_account_id: string | null
          monthly_budget_cents: number | null
          pin_failed_count: number
          pin_locked_until: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          display_name?: string | null
          emergency_pin_hash?: string | null
          last_account_id?: string | null
          monthly_budget_cents?: number | null
          pin_failed_count?: number
          pin_locked_until?: string | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          display_name?: string | null
          emergency_pin_hash?: string | null
          last_account_id?: string | null
          monthly_budget_cents?: number | null
          pin_failed_count?: number
          pin_locked_until?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_last_account_id_fkey"
            columns: ["last_account_id"]
            isOneToOne: false
            referencedRelation: "account_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "profiles_last_account_id_fkey"
            columns: ["last_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_series: {
        Row: {
          account_id: string | null
          active: boolean
          amount_cents: number
          cadence: string
          category_id: string | null
          confirmed: boolean
          created_at: string
          end_date: string | null
          id: string
          merchant_key: string | null
          name: string
          next_date: string
          note: string | null
          pays_account_id: string | null
          user_id: string
        }
        Insert: {
          account_id?: string | null
          active?: boolean
          amount_cents: number
          cadence: string
          category_id?: string | null
          confirmed?: boolean
          created_at?: string
          end_date?: string | null
          id?: string
          merchant_key?: string | null
          name: string
          next_date: string
          note?: string | null
          pays_account_id?: string | null
          user_id?: string
        }
        Update: {
          account_id?: string | null
          active?: boolean
          amount_cents?: number
          cadence?: string
          category_id?: string | null
          confirmed?: boolean
          created_at?: string
          end_date?: string | null
          id?: string
          merchant_key?: string | null
          name?: string
          next_date?: string
          note?: string | null
          pays_account_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_series_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "account_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "recurring_series_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_series_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_series_pays_account_id_fkey"
            columns: ["pays_account_id"]
            isOneToOne: false
            referencedRelation: "account_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "recurring_series_pays_account_id_fkey"
            columns: ["pays_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      rules: {
        Row: {
          account_id: string | null
          category_id: string | null
          created_at: string
          enabled: boolean
          id: string
          is_transfer: boolean
          match_field: string
          match_type: string
          max_cents: number | null
          merchant_id: string | null
          min_cents: number | null
          pattern: string
          priority: number
          user_id: string
        }
        Insert: {
          account_id?: string | null
          category_id?: string | null
          created_at?: string
          enabled?: boolean
          id?: string
          is_transfer?: boolean
          match_field?: string
          match_type?: string
          max_cents?: number | null
          merchant_id?: string | null
          min_cents?: number | null
          pattern: string
          priority?: number
          user_id?: string
        }
        Update: {
          account_id?: string | null
          category_id?: string | null
          created_at?: string
          enabled?: boolean
          id?: string
          is_transfer?: boolean
          match_field?: string
          match_type?: string
          max_cents?: number | null
          merchant_id?: string | null
          min_cents?: number | null
          pattern?: string
          priority?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rules_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "account_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "rules_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rules_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rules_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      savings_goals: {
        Row: {
          account_id: string | null
          archived: boolean
          created_at: string
          id: string
          monthly_contribution_cents: number
          name: string
          target_cents: number
          user_id: string
        }
        Insert: {
          account_id?: string | null
          archived?: boolean
          created_at?: string
          id?: string
          monthly_contribution_cents?: number
          name: string
          target_cents: number
          user_id?: string
        }
        Update: {
          account_id?: string | null
          archived?: boolean
          created_at?: string
          id?: string
          monthly_contribution_cents?: number
          name?: string
          target_cents?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "savings_goals_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "account_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "savings_goals_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      shared_debts: {
        Row: {
          amount_cents: number
          created_at: string
          id: string
          note: string | null
          person: string
          settled_at: string | null
          settlement_transaction_id: string | null
          split_id: string | null
          transaction_id: string | null
          user_id: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          id?: string
          note?: string | null
          person: string
          settled_at?: string | null
          settlement_transaction_id?: string | null
          split_id?: string | null
          transaction_id?: string | null
          user_id?: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          id?: string
          note?: string | null
          person?: string
          settled_at?: string | null
          settlement_transaction_id?: string | null
          split_id?: string | null
          transaction_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shared_debts_settlement_transaction_id_fkey"
            columns: ["settlement_transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shared_debts_split_id_fkey"
            columns: ["split_id"]
            isOneToOne: false
            referencedRelation: "transaction_splits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shared_debts_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      transaction_splits: {
        Row: {
          amount_cents: number
          category_id: string | null
          id: string
          note: string | null
          report_date: string | null
          transaction_id: string
          user_id: string
        }
        Insert: {
          amount_cents: number
          category_id?: string | null
          id?: string
          note?: string | null
          report_date?: string | null
          transaction_id: string
          user_id?: string
        }
        Update: {
          amount_cents?: number
          category_id?: string | null
          id?: string
          note?: string | null
          report_date?: string | null
          transaction_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transaction_splits_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_splits_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          account_id: string
          amount_cents: number
          category_id: string | null
          created_at: string
          date: string
          description: string
          fingerprint: string | null
          id: string
          import_id: string | null
          in_reports: boolean
          is_transfer: boolean
          merchant_id: string | null
          needs_review: boolean
          note: string | null
          pays_account_id: string | null
          posted_date: string | null
          refund_of_id: string | null
          report_date: string | null
          source: string
          transfer_pair_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id: string
          amount_cents: number
          category_id?: string | null
          created_at?: string
          date: string
          description?: string
          fingerprint?: string | null
          id?: string
          import_id?: string | null
          in_reports?: boolean
          is_transfer?: boolean
          merchant_id?: string | null
          needs_review?: boolean
          note?: string | null
          pays_account_id?: string | null
          posted_date?: string | null
          refund_of_id?: string | null
          report_date?: string | null
          source: string
          transfer_pair_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          account_id?: string
          amount_cents?: number
          category_id?: string | null
          created_at?: string
          date?: string
          description?: string
          fingerprint?: string | null
          id?: string
          import_id?: string | null
          in_reports?: boolean
          is_transfer?: boolean
          merchant_id?: string | null
          needs_review?: boolean
          note?: string | null
          pays_account_id?: string | null
          posted_date?: string | null
          refund_of_id?: string | null
          report_date?: string | null
          source?: string
          transfer_pair_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "account_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "imports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_pays_account_id_fkey"
            columns: ["pays_account_id"]
            isOneToOne: false
            referencedRelation: "account_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "transactions_pays_account_id_fkey"
            columns: ["pays_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_refund_of_id_fkey"
            columns: ["refund_of_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_transfer_pair_id_fkey"
            columns: ["transfer_pair_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      account_balances: {
        Row: {
          account_group: string | null
          account_id: string | null
          anchor_date: string | null
          balance_cents: number | null
          hidden: boolean | null
          key: string | null
          name: string | null
          user_id: string | null
        }
        Relationships: []
      }
      ledger_lines: {
        Row: {
          account_id: string | null
          amount_cents: number | null
          category_id: string | null
          date: string | null
          description: string | null
          in_reports: boolean | null
          is_split: boolean | null
          is_transfer: boolean | null
          line_id: string | null
          note: string | null
          report_on: string | null
          transaction_id: string | null
          user_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      [_ in never]: never
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
