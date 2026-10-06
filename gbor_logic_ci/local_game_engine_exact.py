from dataclasses import dataclass, field
from local_rng_engine import generate_outcome

@dataclass
class GameState:
    credit: int = 50000
    wager: int = 100
    pending_win: int = 0
    spin_counter: int = 0
    last_result: list[int] = field(default_factory=list)
    last_outcome: dict | None = None

class LocalGameEngine:
    def __init__(self, seed=None):
        if seed is not None:
            raise ValueError("Fixed RNG seeds are disabled for live local spins")
        self.state = GameState()

    def start(self):
        if self.state.pending_win:
            return {"ok": False, "action": "START",
                    "reason": "COLLECT_REQUIRED", "state": self.snapshot()}
        if self.state.credit < self.state.wager:
            return {"ok": False, "action": "START",
                    "reason": "INSUFFICIENT_VIRTUAL_CREDIT",
                    "state": self.snapshot()}
        outcome = generate_outcome(self.state.wager)
        self.state.credit -= self.state.wager
        self.state.spin_counter += 1
        self.state.last_result = outcome["stops"].copy()
        self.state.pending_win = outcome["win_cents"]
        self.state.last_outcome = outcome
        return {
            "ok": True, "action": "START", "stops": outcome["stops"],
            "rows": outcome["rows"], "paylines": outcome["paylines"],
            "win": outcome["win_cents"], "outcome": outcome,
            "state": self.snapshot(),
        }

    def collect(self):
        paid = self.state.pending_win
        if paid <= 0:
            return {"ok": False, "action": "COLLECT",
                    "reason": "NO_PENDING_WIN", "state": self.snapshot()}
        self.state.credit += paid
        self.state.pending_win = 0
        return {"ok": True, "action": "COLLECT", "paid": paid,
                "state": self.snapshot()}

    def snapshot(self):
        return {
            "credit": self.state.credit, "wager": self.state.wager,
            "pending_win": self.state.pending_win,
            "spin_counter": self.state.spin_counter,
            "last_result": self.state.last_result.copy(),
            "last_outcome": self.state.last_outcome,
        }
