"""Verified client-visible Cash Connection / Golden Book of Ra feature rules.

Derived from static rules/text and client resources already archived from the
authorized free demo. This module deliberately DOES NOT encode the original
RNG, RTP, reel strips, feature probabilities, jackpot contribution math, or
proprietary server wire format.

A separate independent local RNG may decide when an event occurs. Once an
event is supplied, this state machine enforces only feature behavior supported
by archived client evidence.
"""
from __future__ import annotations
from dataclasses import dataclass, field

BASE_GAME_HAS_GOLDEN_BOOK = False
FREE_GAMES_ENTRY_REQUIRES_LOCK_AND_SPIN_AWARD = True
LOCK_AND_SPIN_TRIGGER_MIN_COINS = 6
LOCK_AND_SPIN_INITIAL_FREE_SPINS = 3
LOCK_AND_SPIN_RESET_FREE_SPINS = 3
GRAND_TRIGGER_TOTAL_COINS = 15
SUPER_BONUS_FREE_GAMES = 10
MEGA_BONUS_FREE_GAMES = 25
FREE_GAMES_RETRIGGER_BOOK_MIN = 3
FREE_GAMES_RETRIGGER_AWARD = 10
FREE_GAMES_USES_TRIGGER_BET = True
FREE_GAMES_USES_DIFFERENT_REEL_SET = True
FREE_GAMES_HAS_WILD = False
FREE_GAMES_HAS_COIN = False
COIN_PRIZE_MULTIPLIERS = (1, 2, 3, 10, 20)
COIN_FIXED_FREE_GAME_VALUES = (1, 2, 3, 5)

# GRAND is not an individual Coin award. The verified client rule grants it
# only when all 15 Lock & Spin positions are occupied by Coins.
AWARD_KINDS = frozenset(("PRIZE", "FREE_GAMES", "SUPER", "MEGA", "MAJOR"))


@dataclass(frozen=True)
class CoinAward:
    """One newly locked Coin and its client-visible award."""

    kind: str
    amount: int = 0

    def __post_init__(self):
        if self.kind not in AWARD_KINDS:
            raise ValueError("Unsupported Coin award kind")
        if type(self.amount) is not int or self.amount < 0:
            raise ValueError("Coin award amount must be a non-negative integer")
        if self.kind == "PRIZE" and self.amount not in COIN_PRIZE_MULTIPLIERS:
            raise ValueError("PRIZE Coin requires verified multiplier 1/2/3/10/20")
        if self.kind == "FREE_GAMES" and self.amount not in COIN_FIXED_FREE_GAME_VALUES:
            raise ValueError("FREE_GAMES Coin requires verified count 1/2/3/5")
        if self.kind in ("SUPER","MEGA","MAJOR") and self.amount != 0:
            raise ValueError("Named special Coin awards do not take a numeric amount")


@dataclass
class FeatureState:
    mode: str = "BASE"
    locked_coins: int = 0
    lock_spins_remaining: int = 0
    free_games_remaining: int = 0
    queued_free_games: int = 0
    queued_prize: int = 0
    major_awarded: bool = False
    grand_awarded: bool = False
    completed_features: list[dict] = field(default_factory=list)

    def snapshot(self) -> dict:
        return {
            "mode": self.mode,
            "locked_coins": self.locked_coins,
            "lock_spins_remaining": self.lock_spins_remaining,
            "free_games_remaining": self.free_games_remaining,
            "queued_free_games": self.queued_free_games,
            "queued_prize": self.queued_prize,
            "major_awarded": self.major_awarded,
            "grand_awarded": self.grand_awarded,
        }

    def begin_awarded_free_games(self, awarded: int) -> dict:
        """Enter Free Games from a verified awarded count.

        Cash Connection Golden Book of Ra has NO Golden Book in the Base Game;
        normal entry comes from Free Games collected during Lock & Spin.
        This method is also used by deterministic offline validation fixtures.
        """
        if self.mode != "BASE":
            raise ValueError("Awarded Free Games can only start from BASE")
        if type(awarded) is not int or awarded <= 0:
            raise ValueError("awarded Free Games must be a positive integer")
        self.mode = "FREE_GAMES"
        self.free_games_remaining = awarded
        return self.snapshot()

    def trigger_base_free_games(self, book_count: int) -> dict:
        raise ValueError(
            "Golden Book is absent from the Base Game in this Cash Connection variant")

    def trigger_lock_and_spin(self, trigger_awards: list[CoinAward]) -> dict:
        if self.mode != "BASE":
            raise ValueError("Lock & Spin can only start from BASE")
        if len(trigger_awards) < LOCK_AND_SPIN_TRIGGER_MIN_COINS:
            raise ValueError("At least 6 Coin symbols are required")
        if len(trigger_awards) > GRAND_TRIGGER_TOTAL_COINS:
            raise ValueError("A 5x3 layout cannot contain more than 15 Coins")
        self.mode = "LOCK_AND_SPIN"
        self.locked_coins = 0
        self.lock_spins_remaining = LOCK_AND_SPIN_INITIAL_FREE_SPINS
        self.queued_free_games = 0
        self.queued_prize = 0
        self.major_awarded = False
        self.grand_awarded = False
        self._add_coins(trigger_awards)
        if self.locked_coins >= GRAND_TRIGGER_TOTAL_COINS:
            self.grand_awarded = True
            return self._finish_lock_and_spin("GRAND_15_COINS")
        return self.snapshot()

    def play_lock_spin(self, new_awards: list[CoinAward]) -> dict:
        if self.mode != "LOCK_AND_SPIN":
            raise ValueError("Not in Lock & Spin")
        if self.lock_spins_remaining <= 0:
            raise ValueError("No Lock & Spin Free Spins remain")
        self.lock_spins_remaining -= 1
        if new_awards:
            if self.locked_coins + len(new_awards) > GRAND_TRIGGER_TOTAL_COINS:
                raise ValueError("Coin count exceeds 15 positions")
            self._add_coins(new_awards)
            self.lock_spins_remaining = LOCK_AND_SPIN_RESET_FREE_SPINS
            if self.locked_coins >= GRAND_TRIGGER_TOTAL_COINS:
                self.grand_awarded = True
                return self._finish_lock_and_spin("GRAND_15_COINS")
        if self.lock_spins_remaining == 0:
            return self._finish_lock_and_spin("RESPINS_EXHAUSTED")
        return self.snapshot()

    def play_free_game(self, golden_book_count: int = 0) -> dict:
        if self.mode != "FREE_GAMES":
            raise ValueError("Not in Free Games")
        if self.free_games_remaining <= 0:
            raise ValueError("No Free Games remain")
        self.free_games_remaining -= 1
        retrigger = golden_book_count >= FREE_GAMES_RETRIGGER_BOOK_MIN
        if retrigger:
            self.free_games_remaining += FREE_GAMES_RETRIGGER_AWARD
        if self.free_games_remaining == 0:
            self.completed_features.append({"feature": "FREE_GAMES"})
            self.mode = "BASE"
        result = self.snapshot()
        result["retriggered"] = retrigger
        result["retrigger_award"] = FREE_GAMES_RETRIGGER_AWARD if retrigger else 0
        return result

    def _add_coins(self, awards: list[CoinAward]) -> None:
        for award in awards:
            self.locked_coins += 1
            if award.kind == "PRIZE":
                self.queued_prize += award.amount
            elif award.kind == "FREE_GAMES":
                self.queued_free_games += award.amount
            elif award.kind == "SUPER":
                self.queued_free_games += SUPER_BONUS_FREE_GAMES
            elif award.kind == "MEGA":
                self.queued_free_games += MEGA_BONUS_FREE_GAMES
            elif award.kind == "MAJOR":
                self.major_awarded = True

    def _finish_lock_and_spin(self, reason: str) -> dict:
        summary = {
            "feature": "LOCK_AND_SPIN",
            "reason": reason,
            "locked_coins": self.locked_coins,
            "prize": self.queued_prize,
            "free_games_awarded": self.queued_free_games,
            "major_awarded": self.major_awarded,
            "grand_awarded": self.grand_awarded,
        }
        self.completed_features.append(summary)
        self.lock_spins_remaining = 0
        if self.queued_free_games > 0:
            self.mode = "FREE_GAMES"
            self.free_games_remaining = self.queued_free_games
            self.queued_free_games = 0
        else:
            self.mode = "BASE"
        result = self.snapshot()
        result["lock_and_spin_completed"] = summary
        return result


def verified_rules() -> dict:
    return {
        "base_game_has_golden_book": BASE_GAME_HAS_GOLDEN_BOOK,
        "free_games_entry_requires_lock_and_spin_award": FREE_GAMES_ENTRY_REQUIRES_LOCK_AND_SPIN_AWARD,
        "lock_and_spin_trigger_min_coins": LOCK_AND_SPIN_TRIGGER_MIN_COINS,
        "lock_and_spin_initial_free_spins": LOCK_AND_SPIN_INITIAL_FREE_SPINS,
        "lock_and_spin_reset_free_spins": LOCK_AND_SPIN_RESET_FREE_SPINS,
        "grand_trigger_total_coins": GRAND_TRIGGER_TOTAL_COINS,
        "super_bonus_free_games": SUPER_BONUS_FREE_GAMES,
        "mega_bonus_free_games": MEGA_BONUS_FREE_GAMES,
        "free_games_retrigger_book_min": FREE_GAMES_RETRIGGER_BOOK_MIN,
        "free_games_retrigger_award": FREE_GAMES_RETRIGGER_AWARD,
        "free_games_uses_trigger_bet": FREE_GAMES_USES_TRIGGER_BET,
        "free_games_uses_different_reel_set": FREE_GAMES_USES_DIFFERENT_REEL_SET,
        "free_games_has_wild": FREE_GAMES_HAS_WILD,
        "free_games_has_coin": FREE_GAMES_HAS_COIN,
        "coin_prize_multipliers": COIN_PRIZE_MULTIPLIERS,
        "coin_fixed_free_game_values": COIN_FIXED_FREE_GAME_VALUES,
        "probabilities_verified": False,
        "original_rng_recovered": False,
        "original_wire_format_verified": False,
    }
