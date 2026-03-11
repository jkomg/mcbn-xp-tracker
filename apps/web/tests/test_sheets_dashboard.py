from app.models import Character, SpendRequest, XPClaim
from app.sheets import SheetsClient, TAB_XP_LEDGER


def test_get_dashboard_data_aggregates_without_n_plus_one():
    client = SheetsClient.__new__(SheetsClient)

    client.get_all_characters = lambda: [
        Character(character_name="Alice", active=True, creation_xp=5),
        Character(character_name="Bob", active=False, creation_xp=2),
    ]
    client.get_all_claims = lambda: [
        XPClaim(character_name="Alice", status="Approved", timestamp="20250101 10:00:00"),
        XPClaim(character_name="Alice", status="Denied", timestamp="20250102 10:00:00"),
    ]
    client.get_all_spends = lambda: [
        SpendRequest(character_name="Alice", status="Approved", verified_cost=3),
        SpendRequest(character_name="Alice", status="Pending", verified_cost=9),
    ]
    client._get_all_rows = lambda tab: [
        {"character_name": "Alice", "awarded": 10, "spent": 1},
        {"character_name": "Bob", "awarded": 4, "spent": 0},
    ] if tab == TAB_XP_LEDGER else []

    rows = client.get_dashboard_data()
    assert rows[0]["character_name"] == "Alice"
    assert rows[0]["available_xp"] == 11  # 5 creation + 10 awarded - 3 approved - 1 ledger spend
    assert rows[0]["last_submission"] == "20250101 10:00:00"
    assert rows[1]["character_name"] == "Bob"
    assert rows[1]["available_xp"] == 6


def test_pending_filters_tolerate_status_whitespace():
    client = SheetsClient.__new__(SheetsClient)

    client.get_all_claims = lambda: [
        XPClaim(character_name="Alice", status="Pending "),
        XPClaim(character_name="Bob", status="Approved"),
    ]
    client.get_all_spends = lambda: [
        SpendRequest(character_name="Alice", status=" pending"),
        SpendRequest(character_name="Bob", status="Denied"),
    ]

    pending_claims = client.get_pending_claims()
    pending_spends = client.get_pending_spends()

    assert [c.character_name for c in pending_claims] == ["Alice"]
    assert [s.character_name for s in pending_spends] == ["Alice"]
