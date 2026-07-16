export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          username: string
          avatar_url: string | null
          created_at: string
          favorite_team_names: string[]
          favorite_league_ids: number[]
        }
        Insert: {
          id: string
          username: string
          avatar_url?: string | null
          created_at?: string
          favorite_team_names?: string[]
          favorite_league_ids?: number[]
        }
        Update: {
          id?: string
          username?: string
          avatar_url?: string | null
          created_at?: string
          favorite_team_names?: string[]
          favorite_league_ids?: number[]
        }
      }
      matches: {
        Row: {
          id: string
          api_football_id: number
          league_id: number
          season: number
          home_team_id: number
          away_team_id: number
          home_team_name: string
          away_team_name: string
          home_team_logo: string | null
          away_team_logo: string | null
          kickoff_time: string
          status: string
          home_score: number | null
          away_score: number | null
          home_penalty_score: number | null
          away_penalty_score: number | null
          round: string | null
          venue: string | null
          onexbet_stats: Json | null
          pregame_summary: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          api_football_id: number
          league_id: number
          season: number
          home_team_id: number
          away_team_id: number
          home_team_name: string
          away_team_name: string
          home_team_logo?: string | null
          away_team_logo?: string | null
          kickoff_time: string
          status?: string
          home_score?: number | null
          away_score?: number | null
          home_penalty_score?: number | null
          away_penalty_score?: number | null
          round?: string | null
          venue?: string | null
        }
        Update: {
          status?: string
          home_score?: number | null
          away_score?: number | null
          home_penalty_score?: number | null
          away_penalty_score?: number | null
          onexbet_stats?: Json | null
          pregame_summary?: string | null
          updated_at?: string
        }
      }
      predictions: {
        Row: {
          id: string
          user_id: string
          match_id: string
          predicted_home: number
          predicted_away: number
          points_awarded: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          match_id: string
          predicted_home: number
          predicted_away: number
          points_awarded?: number | null
        }
        Update: {
          predicted_home?: number
          predicted_away?: number
          points_awarded?: number | null
          updated_at?: string
        }
      }
      private_leagues: {
        Row: {
          id: string
          name: string
          invite_code: string
          created_by: string
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          invite_code?: string
          created_by: string
        }
        Update: {
          name?: string
        }
      }
      private_league_members: {
        Row: {
          id: string
          league_id: string
          user_id: string
          joined_at: string
        }
        Insert: {
          id?: string
          league_id: string
          user_id: string
        }
        Update: never
      }
      leaderboard_cache: {
        Row: {
          user_id: string
          username: string
          avatar_url: string | null
          total_points: number
          exact_scores: number
          correct_results: number
          total_preds: number
          updated_at: string
        }
        Insert: {
          user_id: string
          username: string
          avatar_url?: string | null
          total_points?: number
          exact_scores?: number
          correct_results?: number
          total_preds?: number
        }
        Update: {
          username?: string
          avatar_url?: string | null
          total_points?: number
          exact_scores?: number
          correct_results?: number
          total_preds?: number
          updated_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      score_match_predictions: {
        Args: { p_match_id: string }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
  }
}

export type Profile = Database['public']['Tables']['profiles']['Row']
export type Match = Database['public']['Tables']['matches']['Row']
export type Prediction = Database['public']['Tables']['predictions']['Row']
export type PrivateLeague = Database['public']['Tables']['private_leagues']['Row']
export type PrivateLeagueMember = Database['public']['Tables']['private_league_members']['Row']
export type LeaderboardEntry = Database['public']['Tables']['leaderboard_cache']['Row']
