<!-- internal -->

### Fixed

- Room service failures on the hosted site now record the underlying storage error, so a "service unavailable" message can be traced to its cause.
- When the hosted site's room storage is suspended, creating or joining a room now says so instead of showing a generic "temporarily unavailable" message.
