


```ascii
                                PostGress Modular Driver











 ┌──────────────────────────────────────────────────────────────────┐                       ┌───────────────────────┐
 │                                                                  │      On Connect       │    Authentication &   │
 │      Socket Pool  (low level events and external directives)     ├──────────────────────►│    Encryption         │
 │                                                                  │                       │                       │
 └────────────▲─┬───────────────────▲───────────────────────────────┘                       └──────────┬────────────┘
              │ │                   │                     ▲  ▲  ▲                                      │
              │ │                   │                     │  │  │                           ┌──────────▼────────────┐
              │ │         ┌─────────┴──────────────────┐  │  │  │                           │   Protocol setup      │
              │ │         │                            │  │  │  └───────────────────────────┤                       │
              │ │         │  Socket pool strategist    │  │  │                              └──────────┬────────────┘
              │ │         │                            │  │  │                                         │
              │ │         └────────────────────────────┘  │  │                              ┌──────────▼────────────┐
              │ │                                         │  │                              │   Session Setup       │
              │ │                                         │  └──────────────────────────────┤                       │
 ┌────────────┴─▼────────────────┐                        │                                 └───────────┬───────────┘
 │                               │                        │                                             │
 │   Line Wire Protocol Handler  │                        │                                             │
 │                               │                        │                                             │
 └──────────────────┬────────────┘                        │                                             │
             ▲      │                                     │                                             │
             │      │                                     │                                             │
 ┌───────────┴──────▼────────────┐                        │                                             │
 │                               │                        │                                ┌────────────▼───────────┐
 │  Session Manager              │                        │                                │                        │
 │                               │                        └────────────────────────────────┤     Client Setup       │
 └───────────▲─────┬─────────────┘                                                         │                        │
             │     │                                                                       └────────────────────────┘
             │     │
┌────────────┴─────▼────────────┐
│                               │
│   Client                      │
│                               │
└───────────────────────────────┘
```