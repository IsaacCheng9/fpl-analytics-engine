"""Define shared positions, DefCon thresholds and expected-stat coverage."""

from enum import StrEnum

PARTIAL_EXPECTED_STAT_SEASON = "2022-23"
PARTIAL_EXPECTED_STAT_START_GW = 16


class Position(StrEnum):
    """Player position, mirroring the FPL element types."""

    GK = "GK"
    DEF = "DEF"
    MID = "MID"
    FWD = "FWD"
    MNG = "MNG"


# Single source of truth mapping FPL element_type ids to positions.
ELEMENT_TYPE_TO_POSITION = {
    1: Position.GK,
    2: Position.DEF,
    3: Position.MID,
    4: Position.FWD,
    5: Position.MNG,
}

# Defensive-contribution points threshold per position (GK and managers are
# ineligible). Defenders need 10+ CBIT; midfielders and forwards need 12+ CBIRT.
# The API's defensive_contribution field already holds the positional count.
DEFCON_THRESHOLDS = {
    Position.DEF: 10,
    Position.MID: 12,
    Position.FWD: 12,
}
