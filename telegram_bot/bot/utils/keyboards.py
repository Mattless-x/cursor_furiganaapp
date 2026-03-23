"""Reusable InlineKeyboard builders."""

from telegram import InlineKeyboardButton, InlineKeyboardMarkup


def scale_keyboard(min_val: int, max_val: int, prefix: str) -> InlineKeyboardMarkup:
    """One row per 5 buttons so it looks clean on mobile."""
    buttons: list[list[InlineKeyboardButton]] = []
    row: list[InlineKeyboardButton] = []
    for i in range(min_val, max_val + 1):
        row.append(InlineKeyboardButton(str(i), callback_data=f"{prefix}:{i}"))
        if len(row) == 5:
            buttons.append(row)
            row = []
    if row:
        buttons.append(row)
    return InlineKeyboardMarkup(buttons)


def boolean_keyboard(prefix: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([[
        InlineKeyboardButton("✅ Yes", callback_data=f"{prefix}:yes"),
        InlineKeyboardButton("❌ No", callback_data=f"{prefix}:no"),
    ]])


def multi_choice_keyboard(choices: list[str], prefix: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([
        [InlineKeyboardButton(c, callback_data=f"{prefix}:{c}")]
        for c in choices
    ])


def confirm_keyboard(prefix: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([[
        InlineKeyboardButton("✅ Confirm", callback_data=f"{prefix}:confirm"),
        InlineKeyboardButton("❌ Cancel", callback_data=f"{prefix}:cancel"),
    ]])


def frequency_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([[
        InlineKeyboardButton("📅 Daily", callback_data="freq:daily"),
        InlineKeyboardButton("📆 Weekly", callback_data="freq:weekly"),
    ]])


def weekday_keyboard() -> InlineKeyboardMarkup:
    days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    return InlineKeyboardMarkup([[
        InlineKeyboardButton(d, callback_data=f"weekday:{i}")
        for i, d in enumerate(days)
    ]])


def question_type_keyboard() -> InlineKeyboardMarkup:
    types = [
        ("📊 Scale", "scale"),
        ("✓/✗ Boolean", "boolean"),
        ("💬 Text", "text"),
        ("🔢 Numeric", "numeric"),
        ("☑️ Multi-Choice", "multi_choice"),
    ]
    return InlineKeyboardMarkup([
        [InlineKeyboardButton(label, callback_data=f"qtype:{code}")]
        for label, code in types
    ])


def sessions_keyboard(sessions: list, prefix: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([
        [InlineKeyboardButton(s.name, callback_data=f"{prefix}:{s.id}")]
        for s in sessions
    ])
