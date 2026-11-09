"""Synthetic scenarios and their evidence-backed scoring rubrics."""

SCENARIOS = [
    {
        "id": "password-spray",
        "level": 1,
        "title": "Password spray against customer accounts",
        "severity": "medium",
        "events": [
            ("identity", "login_failed", "Multiple accounts rejected a password from 192.0.2.10."),
            ("identity", "login_failed", "More failed logins from 192.0.2.10 across customer accounts."),
            ("detector", "alert", "Password spray threshold exceeded for 192.0.2.10."),
        ],
        "rubric": [
            ("Identify the password spray", ["password spray", "password spraying"]),
            ("Identify the source 192.0.2.10", ["192.0.2.10"]),
            ("Recommend blocking the source", ["block", "deny"]),
            ("Review affected accounts and reset credentials", ["reset", "credential"]),
        ],
    },
    {
        "id": "brute-force",
        "level": 1,
        "title": "Repeated login failures on one account",
        "severity": "medium",
        "events": [
            ("identity", "login_failed", "Repeated failures for customer c-101 from 192.0.2.20."),
            ("identity", "login_failed", "More failures for customer c-101 from 192.0.2.20."),
            ("detector", "alert", "Single-account brute force threshold exceeded."),
        ],
        "rubric": [
            ("Identify brute force", ["brute force", "brute-force"]),
            ("Identify customer c-101", ["c-101"]),
            ("Block the source 192.0.2.20", ["192.0.2.20"]),
            ("Recommend blocking or rate limiting", ["block", "rate limit"]),
        ],
    },
    {
        "id": "credential-stuffing",
        "level": 2,
        "title": "Credential stuffing with a successful login",
        "severity": "high",
        "events": [
            ("identity", "login_failed", "Repeated failures from 198.51.100.24 against customer accounts."),
            ("identity", "login_success", "Customer account c-104 authenticated from 198.51.100.24 after failures."),
            ("detector", "alert", "Credential stuffing pattern and suspicious successful login detected."),
        ],
        "rubric": [
            ("Identify credential stuffing", ["credential stuffing"]),
            ("Identify the source 198.51.100.24 and account c-104", ["198.51.100.24", "c-104"]),
            ("Revoke the suspicious session", ["revoke", "terminate", "invalidate"]),
            ("Reset the affected account's credentials", ["reset"]),
        ],
    },
    {
        "id": "token-misuse",
        "level": 3,
        "title": "Suspicious token reuse",
        "severity": "critical",
        "events": [
            ("gateway", "token_used", "Token for customer c-207 used from 203.0.113.8."),
            ("gateway", "token_used", "Same token used from 203.0.113.77 one minute later."),
            ("detector", "alert", "Token reuse from two sources within one minute."),
        ],
        "rubric": [
            ("Identify token reuse", ["token reuse", "token replay", "reused token"]),
            ("Identify customer c-207", ["c-207"]),
            ("Revoke the token or session", ["revoke", "invalidate"]),
            ("Investigate both source addresses", ["203.0.113.8", "203.0.113.77"]),
        ],
    },
]


def evaluate(scenario, body):
    text = body.casefold()
    feedback = []
    matched = 0
    for description, terms in scenario["rubric"]:
        # Source/account pairs require both facts; other lists are alternatives.
        all_required = description.startswith(("Identify the source 198", "Investigate both"))
        found = all(term in text for term in terms) if all_required else any(term in text for term in terms)
        matched += int(found)
        feedback.append(("Covered: " if found else "Missing: ") + description)
    return round(100 * matched / len(scenario["rubric"])), feedback
