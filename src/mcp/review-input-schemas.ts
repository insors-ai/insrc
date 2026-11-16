/** Frozen callable review schemas. Inert compatibility data; no review engine imports. */
import type { TSchema } from '@sinclair/typebox';
export const DESIGN_REVIEW_PHASES = ["start","progress","assignment","plan","impact","activity","result","recover","failure","cancel"] as const;
export const CODE_REVIEW_PHASES = ["start","resume","progress","cancel","publish","assignment","scope","activity","result"] as const;
export const DESIGN_REVIEW_SCHEMA = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "phase": {
      "type": "string",
      "enum": [
        "start",
        "progress",
        "assignment",
        "plan",
        "impact",
        "activity",
        "result",
        "recover",
        "failure",
        "cancel"
      ]
    },
    "repo": {
      "type": "string"
    },
    "reviewId": {
      "type": "string",
      "minLength": 1,
      "maxLength": 128,
      "pattern": "^[a-zA-Z0-9][a-zA-Z0-9_-]*$"
    },
    "attempt": {
      "type": "integer",
      "minimum": 1,
      "maximum": 9007199254740991
    },
    "resourceRecovery": {
      "description": "Recover phase only: request exact local-broker resource clearance. This does not resume the review; submit a separate explicit recover/new-attempt afterward.",
      "type": "object",
      "properties": {
        "reason": {
          "type": "string",
          "minLength": 1,
          "maxLength": 2048
        },
        "leaseIds": {
          "minItems": 1,
          "maxItems": 128,
          "type": "array",
          "items": {
            "type": "string",
            "minLength": 1,
            "maxLength": 256
          }
        }
      },
      "required": [
        "reason"
      ],
      "additionalProperties": false
    },
    "artifactPath": {
      "type": "string",
      "minLength": 1,
      "maxLength": 2048
    },
    "afterCompletedChunk": {
      "type": "integer",
      "minimum": 0,
      "maximum": 9007199254740991
    },
    "includeResult": {
      "type": "boolean"
    },
    "executionId": {
      "type": "string",
      "minLength": 1,
      "maxLength": 128,
      "pattern": "^[a-zA-Z0-9][a-zA-Z0-9_-]*$"
    },
    "sequence": {
      "type": "integer",
      "minimum": 1,
      "maximum": 9007199254740991
    },
    "plan": {
      "type": "object",
      "properties": {
        "chunks": {
          "minItems": 2,
          "maxItems": 128,
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "id": {
                "type": "string",
                "minLength": 1,
                "maxLength": 128,
                "pattern": "^[a-zA-Z0-9][a-zA-Z0-9_-]*$"
              },
              "title": {
                "type": "string",
                "minLength": 1,
                "maxLength": 8192
              },
              "selectors": {
                "maxItems": 8192,
                "type": "array",
                "items": {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 2048
                }
              },
              "concerns": {
                "maxItems": 8192,
                "type": "array",
                "items": {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 8192
                }
              },
              "dependsOn": {
                "maxItems": 128,
                "type": "array",
                "items": {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 128,
                  "pattern": "^[a-zA-Z0-9][a-zA-Z0-9_-]*$"
                }
              },
              "purpose": {
                "anyOf": [
                  {
                    "type": "string",
                    "const": "substantive"
                  },
                  {
                    "type": "string",
                    "const": "consistency"
                  }
                ]
              }
            },
            "required": [
              "id",
              "title",
              "selectors",
              "concerns",
              "dependsOn",
              "purpose"
            ],
            "additionalProperties": false
          }
        },
        "coverageExplanation": {
          "type": "string",
          "minLength": 1,
          "maxLength": 8192
        },
        "finalConsistencyChunkId": {
          "type": "string",
          "minLength": 1,
          "maxLength": 128,
          "pattern": "^[a-zA-Z0-9][a-zA-Z0-9_-]*$"
        },
        "coverage": {
          "minItems": 1,
          "maxItems": 8192,
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "unitId": {
                "type": "string",
                "minLength": 1,
                "maxLength": 2048
              },
              "chunkIds": {
                "minItems": 1,
                "maxItems": 128,
                "type": "array",
                "items": {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 128,
                  "pattern": "^[a-zA-Z0-9][a-zA-Z0-9_-]*$"
                }
              }
            },
            "required": [
              "unitId",
              "chunkIds"
            ],
            "additionalProperties": false
          }
        }
      },
      "required": [
        "chunks",
        "coverageExplanation",
        "finalConsistencyChunkId",
        "coverage"
      ],
      "additionalProperties": false
    },
    "impact": {
      "type": "object",
      "properties": {
        "baselineAttempt": {
          "type": "integer",
          "minimum": 1,
          "maximum": 128
        },
        "mode": {
          "anyOf": [
            {
              "type": "string",
              "const": "affected_chunks"
            },
            {
              "type": "string",
              "const": "full"
            }
          ]
        },
        "changes": {
          "maxItems": 8192,
          "type": "array",
          "items": {
            "type": "string",
            "minLength": 1,
            "maxLength": 8192
          }
        },
        "directChunkIds": {
          "maxItems": 128,
          "type": "array",
          "items": {
            "type": "string",
            "minLength": 1,
            "maxLength": 128,
            "pattern": "^[a-zA-Z0-9][a-zA-Z0-9_-]*$"
          }
        },
        "indirectChunkIds": {
          "maxItems": 128,
          "type": "array",
          "items": {
            "type": "string",
            "minLength": 1,
            "maxLength": 128,
            "pattern": "^[a-zA-Z0-9][a-zA-Z0-9_-]*$"
          }
        },
        "rationale": {
          "type": "string",
          "minLength": 1,
          "maxLength": 8192
        },
        "uncertainReason": {
          "type": "string",
          "minLength": 1,
          "maxLength": 8192
        },
        "chunkMapping": {
          "maxItems": 128,
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "priorIds": {
                "maxItems": 128,
                "type": "array",
                "items": {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 128,
                  "pattern": "^[a-zA-Z0-9][a-zA-Z0-9_-]*$"
                }
              },
              "currentIds": {
                "maxItems": 128,
                "type": "array",
                "items": {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 128,
                  "pattern": "^[a-zA-Z0-9][a-zA-Z0-9_-]*$"
                }
              },
              "explanation": {
                "type": "string",
                "minLength": 1,
                "maxLength": 8192
              }
            },
            "required": [
              "priorIds",
              "currentIds",
              "explanation"
            ],
            "additionalProperties": false
          }
        },
        "retainedCoverage": {
          "maxItems": 128,
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "chunkId": {
                "type": "string",
                "minLength": 1,
                "maxLength": 128,
                "pattern": "^[a-zA-Z0-9][a-zA-Z0-9_-]*$"
              },
              "fromAttempt": {
                "type": "integer",
                "minimum": 1,
                "maximum": 128
              },
              "fromChunkId": {
                "type": "string",
                "minLength": 1,
                "maxLength": 128,
                "pattern": "^[a-zA-Z0-9][a-zA-Z0-9_-]*$"
              },
              "justification": {
                "type": "string",
                "minLength": 1,
                "maxLength": 8192
              }
            },
            "required": [
              "chunkId",
              "fromAttempt",
              "fromChunkId",
              "justification"
            ],
            "additionalProperties": false
          }
        },
        "carriedFindingIds": {
          "maxItems": 4194304,
          "type": "array",
          "items": {
            "type": "string",
            "minLength": 1,
            "maxLength": 8192
          }
        },
        "consistencyChunkIds": {
          "maxItems": 128,
          "type": "array",
          "items": {
            "type": "string",
            "minLength": 1,
            "maxLength": 128,
            "pattern": "^[a-zA-Z0-9][a-zA-Z0-9_-]*$"
          }
        }
      },
      "required": [
        "baselineAttempt",
        "mode",
        "changes",
        "directChunkIds",
        "indirectChunkIds",
        "rationale",
        "chunkMapping",
        "retainedCoverage",
        "carriedFindingIds",
        "consistencyChunkIds"
      ],
      "additionalProperties": false
    },
    "event": {
      "type": "object",
      "properties": {
        "sessionId": {
          "type": "string",
          "minLength": 1,
          "maxLength": 128,
          "pattern": "^[a-zA-Z0-9][a-zA-Z0-9_-]*$"
        },
        "sequence": {
          "type": "integer",
          "minimum": 1,
          "maximum": 9007199254740991
        },
        "kind": {
          "anyOf": [
            {
              "type": "string",
              "const": "session_started"
            },
            {
              "type": "string",
              "const": "model_output"
            },
            {
              "type": "string",
              "const": "tool_started"
            },
            {
              "type": "string",
              "const": "tool_completed"
            },
            {
              "type": "string",
              "const": "feedback_submitted"
            },
            {
              "type": "string",
              "const": "heartbeat"
            }
          ]
        },
        "toolId": {
          "type": "string",
          "minLength": 1,
          "maxLength": 128,
          "pattern": "^[a-zA-Z0-9][a-zA-Z0-9_-]*$"
        }
      },
      "required": [
        "sessionId",
        "sequence",
        "kind"
      ],
      "additionalProperties": false
    },
    "result": {
      "type": "object",
      "properties": {
        "chunkId": {
          "type": "string",
          "minLength": 1,
          "maxLength": 128,
          "pattern": "^[a-zA-Z0-9][a-zA-Z0-9_-]*$"
        },
        "status": {
          "anyOf": [
            {
              "type": "string",
              "const": "passed"
            },
            {
              "type": "string",
              "const": "changes_requested"
            },
            {
              "type": "string",
              "const": "incomplete"
            }
          ]
        },
        "summary": {
          "type": "string",
          "minLength": 1,
          "maxLength": 8192
        },
        "findings": {
          "maxItems": 256,
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "id": {
                "type": "string",
                "minLength": 1,
                "maxLength": 128,
                "pattern": "^[a-zA-Z0-9][a-zA-Z0-9_-]*$"
              },
              "severity": {
                "anyOf": [
                  {
                    "type": "string",
                    "const": "HIGH"
                  },
                  {
                    "type": "string",
                    "const": "MED"
                  },
                  {
                    "type": "string",
                    "const": "LOW"
                  }
                ]
              },
              "location": {
                "type": "string",
                "minLength": 1,
                "maxLength": 2048
              },
              "message": {
                "type": "string",
                "minLength": 1,
                "maxLength": 8192
              },
              "evidenceReferences": {
                "minItems": 1,
                "maxItems": 128,
                "type": "array",
                "items": {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 2048
                }
              }
            },
            "required": [
              "id",
              "severity",
              "location",
              "message",
              "evidenceReferences"
            ],
            "additionalProperties": false
          }
        },
        "inspectedReferences": {
          "maxItems": 8192,
          "type": "array",
          "items": {
            "type": "string",
            "minLength": 1,
            "maxLength": 2048
          }
        },
        "limitations": {
          "maxItems": 4210690,
          "type": "array",
          "items": {
            "type": "string",
            "minLength": 1,
            "maxLength": 8192
          }
        },
        "advice": {
          "maxItems": 8192,
          "type": "array",
          "items": {
            "type": "string",
            "minLength": 1,
            "maxLength": 8192
          }
        },
        "findingDecisions": {
          "maxItems": 4194304,
          "type": "array",
          "items": {
            "anyOf": [
              {
                "type": "object",
                "properties": {
                  "source": {
                    "type": "object",
                    "properties": {
                      "attempt": {
                        "type": "integer",
                        "minimum": 1,
                        "maximum": 128
                      },
                      "chunkId": {
                        "type": "string",
                        "minLength": 1,
                        "maxLength": 128,
                        "pattern": "^[a-zA-Z0-9][a-zA-Z0-9_-]*$"
                      },
                      "findingId": {
                        "type": "string",
                        "minLength": 1,
                        "maxLength": 128,
                        "pattern": "^[a-zA-Z0-9][a-zA-Z0-9_-]*$"
                      }
                    },
                    "required": [
                      "attempt",
                      "chunkId",
                      "findingId"
                    ],
                    "additionalProperties": false
                  },
                  "rationale": {
                    "type": "string",
                    "minLength": 1,
                    "maxLength": 8192
                  },
                  "evidenceReferences": {
                    "minItems": 1,
                    "maxItems": 128,
                    "type": "array",
                    "items": {
                      "type": "string",
                      "minLength": 1,
                      "maxLength": 2048
                    }
                  },
                  "action": {
                    "type": "string",
                    "const": "carry"
                  }
                },
                "required": [
                  "source",
                  "rationale",
                  "evidenceReferences",
                  "action"
                ],
                "additionalProperties": false
              },
              {
                "type": "object",
                "properties": {
                  "source": {
                    "type": "object",
                    "properties": {
                      "attempt": {
                        "type": "integer",
                        "minimum": 1,
                        "maximum": 128
                      },
                      "chunkId": {
                        "type": "string",
                        "minLength": 1,
                        "maxLength": 128,
                        "pattern": "^[a-zA-Z0-9][a-zA-Z0-9_-]*$"
                      },
                      "findingId": {
                        "type": "string",
                        "minLength": 1,
                        "maxLength": 128,
                        "pattern": "^[a-zA-Z0-9][a-zA-Z0-9_-]*$"
                      }
                    },
                    "required": [
                      "attempt",
                      "chunkId",
                      "findingId"
                    ],
                    "additionalProperties": false
                  },
                  "rationale": {
                    "type": "string",
                    "minLength": 1,
                    "maxLength": 8192
                  },
                  "evidenceReferences": {
                    "minItems": 1,
                    "maxItems": 128,
                    "type": "array",
                    "items": {
                      "type": "string",
                      "minLength": 1,
                      "maxLength": 2048
                    }
                  },
                  "action": {
                    "type": "string",
                    "const": "resolved"
                  },
                  "reviewedInChunkIds": {
                    "minItems": 1,
                    "maxItems": 128,
                    "type": "array",
                    "items": {
                      "type": "string",
                      "minLength": 1,
                      "maxLength": 128,
                      "pattern": "^[a-zA-Z0-9][a-zA-Z0-9_-]*$"
                    }
                  }
                },
                "required": [
                  "source",
                  "rationale",
                  "evidenceReferences",
                  "action",
                  "reviewedInChunkIds"
                ],
                "additionalProperties": false
              },
              {
                "type": "object",
                "properties": {
                  "source": {
                    "type": "object",
                    "properties": {
                      "attempt": {
                        "type": "integer",
                        "minimum": 1,
                        "maximum": 128
                      },
                      "chunkId": {
                        "type": "string",
                        "minLength": 1,
                        "maxLength": 128,
                        "pattern": "^[a-zA-Z0-9][a-zA-Z0-9_-]*$"
                      },
                      "findingId": {
                        "type": "string",
                        "minLength": 1,
                        "maxLength": 128,
                        "pattern": "^[a-zA-Z0-9][a-zA-Z0-9_-]*$"
                      }
                    },
                    "required": [
                      "attempt",
                      "chunkId",
                      "findingId"
                    ],
                    "additionalProperties": false
                  },
                  "rationale": {
                    "type": "string",
                    "minLength": 1,
                    "maxLength": 8192
                  },
                  "evidenceReferences": {
                    "minItems": 1,
                    "maxItems": 128,
                    "type": "array",
                    "items": {
                      "type": "string",
                      "minLength": 1,
                      "maxLength": 2048
                    }
                  },
                  "action": {
                    "type": "string",
                    "const": "superseded"
                  },
                  "reviewedInChunkIds": {
                    "minItems": 1,
                    "maxItems": 128,
                    "type": "array",
                    "items": {
                      "type": "string",
                      "minLength": 1,
                      "maxLength": 128,
                      "pattern": "^[a-zA-Z0-9][a-zA-Z0-9_-]*$"
                    }
                  },
                  "supersededBy": {
                    "type": "object",
                    "properties": {
                      "chunkId": {
                        "type": "string",
                        "minLength": 1,
                        "maxLength": 128,
                        "pattern": "^[a-zA-Z0-9][a-zA-Z0-9_-]*$"
                      },
                      "findingId": {
                        "type": "string",
                        "minLength": 1,
                        "maxLength": 128,
                        "pattern": "^[a-zA-Z0-9][a-zA-Z0-9_-]*$"
                      }
                    },
                    "required": [
                      "chunkId",
                      "findingId"
                    ],
                    "additionalProperties": false
                  }
                },
                "required": [
                  "source",
                  "rationale",
                  "evidenceReferences",
                  "action",
                  "reviewedInChunkIds",
                  "supersededBy"
                ],
                "additionalProperties": false
              }
            ]
          }
        }
      },
      "required": [
        "chunkId",
        "status",
        "summary",
        "findings",
        "inspectedReferences",
        "limitations",
        "advice"
      ],
      "additionalProperties": false
    },
    "actionId": {
      "type": "string",
      "minLength": 1,
      "maxLength": 128,
      "pattern": "^[a-zA-Z0-9][a-zA-Z0-9_-]*$"
    },
    "operation": {
      "anyOf": [
        {
          "type": "string",
          "const": "resume"
        },
        {
          "type": "string",
          "const": "restart_full"
        },
        {
          "type": "string",
          "const": "retry_publication"
        }
      ]
    },
    "userDecision": {
      "type": "object",
      "properties": {
        "action": {
          "anyOf": [
            {
              "type": "string",
              "const": "restart_full"
            },
            {
              "type": "string",
              "const": "retry_failed_unit"
            }
          ]
        },
        "reason": {
          "type": "string",
          "minLength": 1,
          "maxLength": 8192
        },
        "recordedAt": {
          "type": "string",
          "minLength": 20,
          "maxLength": 30,
          "pattern": "^\\d{4}-\\d{2}-\\d{2}T.*Z$"
        }
      },
      "required": [
        "action",
        "reason",
        "recordedAt"
      ],
      "additionalProperties": false
    },
    "failure": {
      "type": "object",
      "properties": {
        "code": {
          "anyOf": [
            {
              "type": "string",
              "const": "process_failed"
            },
            {
              "type": "string",
              "const": "transport_failed"
            },
            {
              "type": "string",
              "const": "review_inactive"
            },
            {
              "type": "string",
              "const": "invalid_output"
            }
          ]
        },
        "summary": {
          "type": "string",
          "minLength": 1,
          "maxLength": 8192
        }
      },
      "required": [
        "code",
        "summary"
      ],
      "additionalProperties": false
    },
    "reason": {
      "type": "string",
      "minLength": 1,
      "maxLength": 2048
    }
  },
  "required": [
    "phase",
    "reviewId",
    "attempt"
  ],
  "additionalProperties": false
} as unknown as TSchema;
export const CODE_REVIEW_SCHEMA = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "phase": {
      "type": "string",
      "enum": [
        "start",
        "resume",
        "progress",
        "cancel",
        "publish",
        "assignment",
        "scope",
        "activity",
        "result"
      ]
    },
    "repo": {
      "type": "string"
    },
    "epicHash": {
      "type": "string",
      "pattern": "^[a-f0-9]{16}$"
    },
    "reviewId": {
      "type": "string",
      "pattern": "^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$"
    },
    "attempt": {
      "type": "integer",
      "exclusiveMinimum": 0,
      "maximum": 9007199254740991
    },
    "reason": {
      "type": "string",
      "minLength": 1,
      "maxLength": 2048
    },
    "resourceRecovery": {
      "description": "Resume phase only: request exact local-broker resource clearance, without resuming work. A separate explicit resume/new-attempt is required afterward.",
      "type": "object",
      "properties": {
        "reason": {
          "type": "string",
          "minLength": 1,
          "maxLength": 2048
        },
        "leaseIds": {
          "minItems": 1,
          "maxItems": 128,
          "type": "array",
          "items": {
            "type": "string",
            "minLength": 1,
            "maxLength": 256
          }
        }
      },
      "required": [
        "reason"
      ],
      "additionalProperties": false
    },
    "storyId": {
      "description": "Optional permanent code-history locator after checkpoint cleanup.",
      "type": "string",
      "pattern": "^s\\d+$"
    },
    "packet": {
      "type": "object",
      "properties": {
        "reviewRevision": {
          "type": "string",
          "pattern": "^(?:[0-9a-f]{40}|[0-9a-f]{64})$",
          "description": "Required explicit full Git commit OID for the final reviewed source revision. All selected origin commits must be its ancestors. Never infer HEAD. Original commit selections remain provenance; only their verified final projections authorize findings."
        },
        "storyId": {
          "type": "string",
          "minLength": 1,
          "maxLength": 65536
        },
        "taskId": {
          "type": "string",
          "minLength": 1,
          "maxLength": 65536
        },
        "functionalSummary": {
          "type": "string",
          "minLength": 1,
          "maxLength": 65536
        },
        "documents": {
          "type": "object",
          "properties": {
            "story": {
              "type": "object",
              "properties": {
                "path": {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 65536
                },
                "commit": {
                  "type": "string",
                  "pattern": "^(?:[0-9a-f]{40}|[0-9a-f]{64})$"
                }
              },
              "required": [
                "path",
                "commit"
              ],
              "additionalProperties": false
            },
            "lld": {
              "type": "object",
              "properties": {
                "path": {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 65536
                },
                "commit": {
                  "type": "string",
                  "pattern": "^(?:[0-9a-f]{40}|[0-9a-f]{64})$"
                }
              },
              "required": [
                "path",
                "commit"
              ],
              "additionalProperties": false
            },
            "plan": {
              "type": "object",
              "properties": {
                "path": {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 65536
                },
                "commit": {
                  "type": "string",
                  "pattern": "^(?:[0-9a-f]{40}|[0-9a-f]{64})$"
                }
              },
              "required": [
                "path",
                "commit"
              ],
              "additionalProperties": false
            },
            "issue": {
              "type": "object",
              "properties": {
                "path": {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 65536
                },
                "commit": {
                  "type": "string",
                  "pattern": "^(?:[0-9a-f]{40}|[0-9a-f]{64})$"
                }
              },
              "required": [
                "path",
                "commit"
              ],
              "additionalProperties": false
            }
          },
          "additionalProperties": false
        },
        "reviewSet": {
          "minItems": 1,
          "maxItems": 10000,
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "commit": {
                "type": "string",
                "pattern": "^(?:[0-9a-f]{40}|[0-9a-f]{64})$"
              },
              "parent": {
                "anyOf": [
                  {
                    "type": "string",
                    "pattern": "^(?:[0-9a-f]{40}|[0-9a-f]{64})$"
                  },
                  {
                    "type": "null"
                  }
                ]
              },
              "files": {
                "minItems": 1,
                "maxItems": 10000,
                "type": "array",
                "items": {
                  "type": "object",
                  "properties": {
                    "path": {
                      "type": "string",
                      "minLength": 1,
                      "maxLength": 65536
                    },
                    "previousPath": {
                      "type": "string",
                      "minLength": 1,
                      "maxLength": 65536
                    },
                    "segments": {
                      "maxItems": 10000,
                      "type": "array",
                      "items": {
                        "type": "object",
                        "properties": {
                          "after": {
                            "minItems": 2,
                            "maxItems": 2,
                            "type": "array",
                            "items": {
                              "type": "integer",
                              "minimum": 1,
                              "maximum": 9007199254740991
                            }
                          },
                          "deletionAt": {
                            "type": "integer",
                            "minimum": 0,
                            "maximum": 9007199254740991
                          }
                        },
                        "additionalProperties": false
                      }
                    }
                  },
                  "required": [
                    "path",
                    "segments"
                  ],
                  "additionalProperties": false
                }
              }
            },
            "required": [
              "commit",
              "parent",
              "files"
            ],
            "additionalProperties": false
          }
        },
        "tests": {
          "maxItems": 10000,
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "file": {
                "type": "string",
                "minLength": 1,
                "maxLength": 65536
              },
              "cases": {
                "minItems": 1,
                "maxItems": 10000,
                "type": "array",
                "items": {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 65536
                }
              },
              "command": {
                "type": "string",
                "minLength": 1,
                "maxLength": 65536
              },
              "result": {
                "anyOf": [
                  {
                    "type": "string",
                    "const": "pass"
                  },
                  {
                    "type": "string",
                    "const": "fail"
                  },
                  {
                    "type": "string",
                    "const": "skipped"
                  },
                  {
                    "type": "string",
                    "const": "not_run"
                  }
                ]
              },
              "executionDetails": {
                "type": "string",
                "minLength": 1,
                "maxLength": 65536
              },
              "evidenceReferences": {
                "maxItems": 10000,
                "type": "array",
                "items": {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 65536
                }
              }
            },
            "required": [
              "file",
              "cases",
              "command",
              "result",
              "executionDetails",
              "evidenceReferences"
            ],
            "additionalProperties": false
          }
        }
      },
      "required": [
        "reviewRevision",
        "storyId",
        "functionalSummary",
        "documents",
        "reviewSet",
        "tests"
      ],
      "additionalProperties": false
    },
    "scope": {
      "anyOf": [
        {
          "type": "object",
          "properties": {
            "tasks": {
              "type": "array",
              "items": {
                "type": "object",
                "properties": {
                  "taskId": {
                    "type": "string"
                  },
                  "changeIndexes": {
                    "type": "array",
                    "items": {
                      "type": "integer",
                      "minimum": 0,
                      "maximum": 9007199254740991
                    }
                  },
                  "testIndexes": {
                    "type": "array",
                    "items": {
                      "type": "integer",
                      "minimum": 0,
                      "maximum": 9007199254740991
                    }
                  }
                },
                "required": [
                  "taskId",
                  "changeIndexes",
                  "testIndexes"
                ],
                "additionalProperties": false
              }
            }
          },
          "required": [
            "tasks"
          ],
          "additionalProperties": false
        },
        {
          "type": "object",
          "properties": {
            "summary": {
              "type": "string",
              "minLength": 1,
              "maxLength": 65536
            },
            "tasks": {
              "minItems": 1,
              "maxItems": 10000,
              "type": "array",
              "items": {
                "anyOf": [
                  {
                    "type": "object",
                    "properties": {
                      "taskId": {
                        "type": "string"
                      },
                      "changeIndexes": {
                        "type": "array",
                        "items": {
                          "type": "integer",
                          "minimum": 0,
                          "maximum": 9007199254740991
                        }
                      },
                      "testIndexes": {
                        "type": "array",
                        "items": {
                          "type": "integer",
                          "minimum": 0,
                          "maximum": 9007199254740991
                        }
                      },
                      "reason": {
                        "type": "string",
                        "minLength": 1,
                        "maxLength": 65536
                      },
                      "action": {
                        "type": "string",
                        "const": "reassess"
                      }
                    },
                    "required": [
                      "taskId",
                      "changeIndexes",
                      "testIndexes",
                      "reason",
                      "action"
                    ],
                    "additionalProperties": false
                  },
                  {
                    "type": "object",
                    "properties": {
                      "taskId": {
                        "type": "string"
                      },
                      "changeIndexes": {
                        "type": "array",
                        "items": {
                          "type": "integer",
                          "minimum": 0,
                          "maximum": 9007199254740991
                        }
                      },
                      "testIndexes": {
                        "type": "array",
                        "items": {
                          "type": "integer",
                          "minimum": 0,
                          "maximum": 9007199254740991
                        }
                      },
                      "reason": {
                        "type": "string",
                        "minLength": 1,
                        "maxLength": 65536
                      },
                      "action": {
                        "type": "string",
                        "const": "reuse"
                      },
                      "sourceAttempt": {
                        "type": "integer",
                        "minimum": 1,
                        "maximum": 9007199254740991
                      }
                    },
                    "required": [
                      "taskId",
                      "changeIndexes",
                      "testIndexes",
                      "reason",
                      "action",
                      "sourceAttempt"
                    ],
                    "additionalProperties": false
                  }
                ]
              }
            }
          },
          "required": [
            "summary",
            "tasks"
          ],
          "additionalProperties": false
        }
      ]
    },
    "result": {
      "type": "object",
      "properties": {
        "taskId": {
          "type": "string",
          "minLength": 1,
          "maxLength": 65536
        },
        "status": {
          "anyOf": [
            {
              "type": "string",
              "const": "passed"
            },
            {
              "type": "string",
              "const": "changes_requested"
            },
            {
              "type": "string",
              "const": "incomplete"
            },
            {
              "type": "string",
              "const": "failed"
            }
          ]
        },
        "summary": {
          "type": "string",
          "minLength": 1,
          "maxLength": 65536
        },
        "findings": {
          "maxItems": 10000,
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "severity": {
                "anyOf": [
                  {
                    "type": "string",
                    "const": "HIGH"
                  },
                  {
                    "type": "string",
                    "const": "MED"
                  },
                  {
                    "type": "string",
                    "const": "LOW"
                  }
                ]
              },
              "location": {
                "type": "string",
                "minLength": 1,
                "maxLength": 65536
              },
              "message": {
                "type": "string",
                "minLength": 1,
                "maxLength": 65536
              },
              "rationale": {
                "type": "string",
                "minLength": 1,
                "maxLength": 65536
              },
              "evidenceReferences": {
                "minItems": 1,
                "maxItems": 10000,
                "type": "array",
                "items": {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 65536
                }
              }
            },
            "required": [
              "severity",
              "location",
              "message",
              "rationale",
              "evidenceReferences"
            ],
            "additionalProperties": false
          }
        },
        "testCoverage": {
          "type": "object",
          "properties": {
            "assessment": {
              "anyOf": [
                {
                  "type": "string",
                  "const": "verified"
                },
                {
                  "type": "string",
                  "const": "partial"
                },
                {
                  "type": "string",
                  "const": "unverified"
                },
                {
                  "type": "string",
                  "const": "unsupported"
                }
              ]
            },
            "explanation": {
              "type": "string",
              "minLength": 1,
              "maxLength": 65536
            },
            "evidenceReferences": {
              "maxItems": 10000,
              "type": "array",
              "items": {
                "type": "string",
                "minLength": 1,
                "maxLength": 65536
              }
            }
          },
          "required": [
            "assessment",
            "explanation",
            "evidenceReferences"
          ],
          "additionalProperties": false,
          "description": "Mandatory evidence-backed review of relevant test coverage. Verified means this assessment is complete, not that tests were executed. Report demonstrated coverage defects in findings."
        },
        "limitations": {
          "maxItems": 10000,
          "type": "array",
          "items": {
            "type": "string",
            "minLength": 1,
            "maxLength": 65536
          },
          "description": "Blocking omissions of mandatory code/module, requirements or test-coverage review only. Any skipped required review scope means incomplete. Do not put skipped optional execution here."
        },
        "advice": {
          "maxItems": 10000,
          "type": "array",
          "items": {
            "type": "string",
            "minLength": 1,
            "maxLength": 65536
          },
          "description": "Nonblocking optional execution disclosures (integration checks, tests, typecheck or build not run) and optional improvements. Prefix execution disclosures with Optional execution:."
        },
        "inspectedReferences": {
          "maxItems": 10000,
          "type": "array",
          "items": {
            "type": "string",
            "minLength": 1,
            "maxLength": 65536
          }
        },
        "executedTests": {
          "maxItems": 10000,
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "file": {
                "type": "string",
                "minLength": 1,
                "maxLength": 65536
              },
              "cases": {
                "minItems": 1,
                "maxItems": 10000,
                "type": "array",
                "items": {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 65536
                }
              },
              "command": {
                "type": "string",
                "minLength": 1,
                "maxLength": 65536
              },
              "result": {
                "anyOf": [
                  {
                    "type": "string",
                    "const": "pass"
                  },
                  {
                    "type": "string",
                    "const": "fail"
                  },
                  {
                    "type": "string",
                    "const": "skipped"
                  },
                  {
                    "type": "string",
                    "const": "not_run"
                  }
                ]
              },
              "executionDetails": {
                "type": "string",
                "minLength": 1,
                "maxLength": 65536
              },
              "evidenceReferences": {
                "maxItems": 10000,
                "type": "array",
                "items": {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 65536
                }
              }
            },
            "required": [
              "file",
              "cases",
              "command",
              "result",
              "executionDetails",
              "evidenceReferences"
            ],
            "additionalProperties": false
          }
        },
        "error": {
          "type": "string",
          "minLength": 1,
          "maxLength": 65536
        }
      },
      "required": [
        "taskId",
        "status",
        "summary",
        "findings",
        "testCoverage",
        "limitations",
        "advice",
        "inspectedReferences",
        "executedTests"
      ],
      "additionalProperties": false
    },
    "taskId": {
      "type": "string"
    },
    "executionId": {
      "type": "string"
    },
    "sequence": {
      "type": "integer",
      "exclusiveMinimum": 0,
      "maximum": 9007199254740991
    },
    "event": {
      "anyOf": [
        {
          "type": "object",
          "properties": {
            "sessionId": {
              "type": "string",
              "minLength": 1
            },
            "sequence": {
              "type": "integer",
              "exclusiveMinimum": 0,
              "maximum": 9007199254740991
            },
            "kind": {
              "type": "string",
              "enum": [
                "session_started",
                "model_output",
                "tool_started",
                "tool_completed",
                "feedback_submitted",
                "heartbeat"
              ]
            },
            "toolId": {
              "type": "string"
            }
          },
          "required": [
            "sessionId",
            "sequence",
            "kind"
          ],
          "additionalProperties": false
        },
        {
          "type": "object",
          "properties": {
            "kind": {
              "type": "string",
              "const": "diagnostic"
            },
            "phase": {
              "type": "string",
              "enum": [
                "attribution",
                "assessment"
              ]
            },
            "diagnostic": {
              "type": "object",
              "properties": {
                "provider": {
                  "anyOf": [
                    {
                      "type": "string",
                      "const": "claude"
                    },
                    {
                      "type": "string",
                      "const": "codex"
                    }
                  ]
                },
                "issues": {
                  "maxItems": 8,
                  "type": "array",
                  "items": {
                    "type": "object",
                    "properties": {
                      "code": {
                        "type": "string",
                        "minLength": 1,
                        "maxLength": 64
                      },
                      "field": {
                        "type": "string",
                        "minLength": 1,
                        "maxLength": 256
                      },
                      "correction": {
                        "type": "string",
                        "minLength": 1,
                        "maxLength": 256
                      },
                      "message": {
                        "type": "string",
                        "maxLength": 1024
                      },
                      "occurrences": {
                        "type": "integer",
                        "minimum": 1,
                        "maximum": 9007199254740991
                      }
                    },
                    "required": [
                      "code",
                      "field",
                      "correction",
                      "occurrences"
                    ],
                    "additionalProperties": false
                  }
                },
                "terminal": {
                  "type": "object",
                  "properties": {
                    "reason": {
                      "type": "string",
                      "minLength": 1,
                      "maxLength": 64
                    },
                    "exitCode": {
                      "type": "integer",
                      "minimum": -9007199254740991,
                      "maximum": 9007199254740991
                    },
                    "message": {
                      "type": "string",
                      "maxLength": 1024
                    }
                  },
                  "required": [
                    "reason"
                  ],
                  "additionalProperties": false
                },
                "lastRejectedFeedback": {
                  "type": "object",
                  "properties": {
                    "preview": {
                      "type": "string",
                      "maxLength": 8192
                    },
                    "truncated": {
                      "type": "boolean"
                    }
                  },
                  "required": [
                    "preview",
                    "truncated"
                  ],
                  "additionalProperties": false
                },
                "truncated": {
                  "type": "boolean"
                }
              },
              "required": [
                "provider",
                "issues"
              ],
              "additionalProperties": false
            }
          },
          "required": [
            "kind",
            "phase",
            "diagnostic"
          ],
          "additionalProperties": false
        }
      ]
    }
  },
  "required": [
    "phase",
    "epicHash",
    "reviewId",
    "attempt"
  ],
  "additionalProperties": false
} as unknown as TSchema;
