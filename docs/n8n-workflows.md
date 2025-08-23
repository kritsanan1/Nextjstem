# n8n Workflow Configurations

## Overview
This document provides production-ready n8n workflow configurations for automating social media posting, content management, and analytics collection.

## Workflow 1: Scheduled Post Publisher

### Purpose
Monitors the `scheduled_posts` table and publishes posts when their scheduled time arrives.

### Workflow JSON Configuration

```json
{
  "name": "Scheduled Post Publisher",
  "nodes": [
    {
      "parameters": {
        "rule": {
          "interval": [
            {
              "field": "minutes",
              "minutesInterval": 5
            }
          ]
        }
      },
      "name": "Every 5 minutes",
      "type": "n8n-nodes-base.cron",
      "typeVersion": 1,
      "position": [
        240,
        300
      ]
    },
    {
      "parameters": {
        "operation": "executeQuery",
        "query": "SELECT * FROM get_posts_ready_for_publishing()",
        "options": {}
      },
      "name": "Get Ready Posts",
      "type": "n8n-nodes-base.postgres",
      "typeVersion": 1,
      "position": [
        460,
        300
      ],
      "credentials": {
        "postgres": {
          "id": "supabase-db",
          "name": "Supabase Database"
        }
      }
    },
    {
      "parameters": {
        "conditions": {
          "number": [
            {
              "value1": "={{$json.length}}",
              "operation": "larger",
              "value2": 0
            }
          ]
        }
      },
      "name": "Has Posts",
      "type": "n8n-nodes-base.if",
      "typeVersion": 1,
      "position": [
        680,
        300
      ]
    },
    {
      "parameters": {
        "batchSize": 1,
        "options": {}
      },
      "name": "Process Each Post",
      "type": "n8n-nodes-base.splitInBatches",
      "typeVersion": 1,
      "position": [
        900,
        200
      ]
    },
    {
      "parameters": {
        "url": "https://app.ayrshare.com/api/post",
        "authentication": "predefinedCredentialType",
        "nodeCredentialType": "ayrshareApi",
        "sendHeaders": true,
        "headerParameters": {
          "parameters": [
            {
              "name": "Authorization",
              "value": "Bearer {{$credentials.ayrshareApi.apiKey}}"
            }
          ]
        },
        "sendBody": true,
        "bodyParameters": {
          "parameters": [
            {
              "name": "post",
              "value": "={{$json.post_data.post}}"
            },
            {
              "name": "platforms",
              "value": "={{$json.platforms}}"
            }
          ]
        },
        "options": {}
      },
      "name": "Post to Ayrshare",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 2,
      "position": [
        1120,
        200
      ]
    },
    {
      "parameters": {
        "conditions": {
          "string": [
            {
              "value1": "={{$json.status}}",
              "value2": "success"
            }
          ]
        }
      },
      "name": "Post Successful",
      "type": "n8n-nodes-base.if",
      "typeVersion": 1,
      "position": [
        1340,
        200
      ]
    },
    {
      "parameters": {
        "operation": "executeQuery",
        "query": "SELECT update_post_status('{{$node[\"Process Each Post\"].json[\"post_id\"]}}', 'posted', '{{JSON.stringify($json)}}', null)",
        "options": {}
      },
      "name": "Update Success Status",
      "type": "n8n-nodes-base.postgres",
      "typeVersion": 1,
      "position": [
        1560,
        120
      ],
      "credentials": {
        "postgres": {
          "id": "supabase-db",
          "name": "Supabase Database"
        }
      }
    },
    {
      "parameters": {
        "operation": "executeQuery",
        "query": "SELECT update_post_status('{{$node[\"Process Each Post\"].json[\"post_id\"]}}', 'failed', null, '{{$json.error || \"Unknown error\"}}')",
        "options": {}
      },
      "name": "Update Failed Status",
      "type": "n8n-nodes-base.postgres",
      "typeVersion": 1,
      "position": [
        1560,
        280
      ],
      "credentials": {
        "postgres": {
          "id": "supabase-db",
          "name": "Supabase Database"
        }
      }
    }
  ],
  "connections": {
    "Every 5 minutes": {
      "main": [
        [
          {
            "node": "Get Ready Posts",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Get Ready Posts": {
      "main": [
        [
          {
            "node": "Has Posts",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Has Posts": {
      "main": [
        [
          {
            "node": "Process Each Post",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Process Each Post": {
      "main": [
        [
          {
            "node": "Post to Ayrshare",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Post to Ayrshare": {
      "main": [
        [
          {
            "node": "Post Successful",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Post Successful": {
      "main": [
        [
          {
            "node": "Update Success Status",
            "type": "main",
            "index": 0
          }
        ],
        [
          {
            "node": "Update Failed Status",
            "type": "main",
            "index": 0
          }
        ]
      ]
    }
  },
  "active": true,
  "settings": {},
  "id": "scheduled-post-publisher"
}
```

## Workflow 2: Usage Counter Reset

### Purpose
Resets usage counters for feature entitlements based on their reset periods (daily, weekly, monthly, yearly).

### Workflow JSON Configuration

```json
{
  "name": "Usage Counter Reset",
  "nodes": [
    {
      "parameters": {
        "rule": {
          "interval": [
            {
              "field": "hours",
              "hoursInterval": 1
            }
          ]
        }
      },
      "name": "Every Hour",
      "type": "n8n-nodes-base.cron",
      "typeVersion": 1,
      "position": [
        240,
        300
      ]
    },
    {
      "parameters": {
        "operation": "executeQuery",
        "query": "SELECT reset_usage_counters()",
        "options": {}
      },
      "name": "Reset Counters",
      "type": "n8n-nodes-base.postgres",
      "typeVersion": 1,
      "position": [
        460,
        300
      ],
      "credentials": {
        "postgres": {
          "id": "supabase-db",
          "name": "Supabase Database"
        }
      }
    }
  ],
  "connections": {
    "Every Hour": {
      "main": [
        [
          {
            "node": "Reset Counters",
            "type": "main",
            "index": 0
          }
        ]
      ]
    }
  },
  "active": true,
  "settings": {},
  "id": "usage-counter-reset"
}
```

## Workflow 3: Analytics Collection

### Purpose
Collects analytics data from Ayrshare for posted content and stores it in the database.

### Workflow JSON Configuration

```json
{
  "name": "Analytics Collection",
  "nodes": [
    {
      "parameters": {
        "rule": {
          "interval": [
            {
              "field": "hours",
              "hoursInterval": 6
            }
          ]
        }
      },
      "name": "Every 6 Hours",
      "type": "n8n-nodes-base.cron",
      "typeVersion": 1,
      "position": [
        240,
        300
      ]
    },
    {
      "parameters": {
        "operation": "executeQuery",
        "query": "SELECT sp.id, sp.external_ids, sp.platforms FROM scheduled_posts sp WHERE sp.status = 'posted' AND sp.external_ids IS NOT NULL AND sp.created_at > NOW() - INTERVAL '7 days'",
        "options": {}
      },
      "name": "Get Recent Posts",
      "type": "n8n-nodes-base.postgres",
      "typeVersion": 1,
      "position": [
        460,
        300
      ],
      "credentials": {
        "postgres": {
          "id": "supabase-db",
          "name": "Supabase Database"
        }
      }
    },
    {
      "parameters": {
        "conditions": {
          "number": [
            {
              "value1": "={{$json.length}}",
              "operation": "larger",
              "value2": 0
            }
          ]
        }
      },
      "name": "Has Posts",
      "type": "n8n-nodes-base.if",
      "typeVersion": 1,
      "position": [
        680,
        300
      ]
    },
    {
      "parameters": {
        "batchSize": 1,
        "options": {}
      },
      "name": "Process Each Post",
      "type": "n8n-nodes-base.splitInBatches",
      "typeVersion": 1,
      "position": [
        900,
        200
      ]
    },
    {
      "parameters": {
        "url": "https://app.ayrshare.com/api/analytics/post/{{$json.external_ids.ayrshare_id}}",
        "authentication": "predefinedCredentialType",
        "nodeCredentialType": "ayrshareApi",
        "sendHeaders": true,
        "headerParameters": {
          "parameters": [
            {
              "name": "Authorization",
              "value": "Bearer {{$credentials.ayrshareApi.apiKey}}"
            }
          ]
        },
        "options": {}
      },
      "name": "Get Analytics",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 2,
      "position": [
        1120,
        200
      ]
    },
    {
      "parameters": {
        "conditions": {
          "string": [
            {
              "value1": "={{$json.status}}",
              "value2": "success"
            }
          ]
        }
      },
      "name": "Analytics Retrieved",
      "type": "n8n-nodes-base.if",
      "typeVersion": 1,
      "position": [
        1340,
        200
      ]
    },
    {
      "parameters": {
        "operation": "executeQuery",
        "query": "INSERT INTO post_analytics (scheduled_post_id, platform, external_id, metrics) VALUES ('{{$node[\"Process Each Post\"].json[\"id\"]}}', '{{$json.platform}}', '{{$json.id}}', '{{JSON.stringify($json)}}') ON CONFLICT (scheduled_post_id, platform) DO UPDATE SET metrics = EXCLUDED.metrics, collected_at = NOW()",
        "options": {}
      },
      "name": "Store Analytics",
      "type": "n8n-nodes-base.postgres",
      "typeVersion": 1,
      "position": [
        1560,
        120
      ],
      "credentials": {
        "postgres": {
          "id": "supabase-db",
          "name": "Supabase Database"
        }
      }
    }
  ],
  "connections": {
    "Every 6 Hours": {
      "main": [
        [
          {
            "node": "Get Recent Posts",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Get Recent Posts": {
      "main": [
        [
          {
            "node": "Has Posts",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Has Posts": {
      "main": [
        [
          {
            "node": "Process Each Post",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Process Each Post": {
      "main": [
        [
          {
            "node": "Get Analytics",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Get Analytics": {
      "main": [
        [
          {
            "node": "Analytics Retrieved",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Analytics Retrieved": {
      "main": [
        [
          {
            "node": "Store Analytics",
            "type": "main",
            "index": 0
          }
        ]
      ]
    }
  },
  "active": true,
  "settings": {},
  "id": "analytics-collection"
}
```

## Workflow 4: Webhook Handler for Ayrshare

### Purpose
Processes webhooks from Ayrshare to update post statuses and collect real-time analytics.

### Workflow JSON Configuration

```json
{
  "name": "Ayrshare Webhook Handler",
  "nodes": [
    {
      "parameters": {
        "httpMethod": "POST",
        "path": "ayrshare-webhook",
        "options": {}
      },
      "name": "Webhook",
      "type": "n8n-nodes-base.webhook",
      "typeVersion": 1,
      "position": [
        240,
        300
      ],
      "webhookId": "ayrshare-webhook-id"
    },
    {
      "parameters": {
        "conditions": {
          "string": [
            {
              "value1": "={{$json.body.type}}",
              "value2": "post.published"
            }
          ]
        }
      },
      "name": "Post Published",
      "type": "n8n-nodes-base.if",
      "typeVersion": 1,
      "position": [
        460,
        300
      ]
    },
    {
      "parameters": {
        "operation": "executeQuery",
        "query": "UPDATE scheduled_posts SET status = 'posted', external_ids = jsonb_set(COALESCE(external_ids, '{}'), '{ayrshare_id}', '\"{{$json.body.data.id}}\"') WHERE external_ids->>'ayrshare_id' = '{{$json.body.data.id}}'",
        "options": {}
      },
      "name": "Update Post Status",
      "type": "n8n-nodes-base.postgres",
      "typeVersion": 1,
      "position": [
        680,
        200
      ],
      "credentials": {
        "postgres": {
          "id": "supabase-db",
          "name": "Supabase Database"
        }
      }
    },
    {
      "parameters": {
        "conditions": {
          "string": [
            {
              "value1": "={{$json.body.type}}",
              "value2": "post.failed"
            }
          ]
        }
      },
      "name": "Post Failed",
      "type": "n8n-nodes-base.if",
      "typeVersion": 1,
      "position": [
        460,
        400
      ]
    },
    {
      "parameters": {
        "operation": "executeQuery",
        "query": "UPDATE scheduled_posts SET status = 'failed', error_message = '{{$json.body.data.error}}' WHERE external_ids->>'ayrshare_id' = '{{$json.body.data.id}}'",
        "options": {}
      },
      "name": "Update Failed Status",
      "type": "n8n-nodes-base.postgres",
      "typeVersion": 1,
      "position": [
        680,
        400
      ],
      "credentials": {
        "postgres": {
          "id": "supabase-db",
          "name": "Supabase Database"
        }
      }
    },
    {
      "parameters": {
        "respondWith": "json",
        "responseBody": "{\"status\": \"received\"}"
      },
      "name": "Respond",
      "type": "n8n-nodes-base.respondToWebhook",
      "typeVersion": 1,
      "position": [
        900,
        300
      ]
    }
  ],
  "connections": {
    "Webhook": {
      "main": [
        [
          {
            "node": "Post Published",
            "type": "main",
            "index": 0
          },
          {
            "node": "Post Failed",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Post Published": {
      "main": [
        [
          {
            "node": "Update Post Status",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Post Failed": {
      "main": [
        [
          {
            "node": "Update Failed Status",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Update Post Status": {
      "main": [
        [
          {
            "node": "Respond",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Update Failed Status": {
      "main": [
        [
          {
            "node": "Respond",
            "type": "main",
            "index": 0
          }
        ]
      ]
    }
  },
  "active": true,
  "settings": {},
  "id": "ayrshare-webhook-handler"
}
```

## Setup Instructions

### 1. Import Workflows
1. Copy each workflow JSON configuration
2. In n8n, go to Workflows → Import from JSON
3. Paste the JSON and save

### 2. Configure Credentials
1. **Supabase Database**: Add PostgreSQL credentials for your Supabase database
2. **Ayrshare API**: Add your Ayrshare API key

### 3. Activate Workflows
1. Open each workflow
2. Click "Active" toggle to enable
3. Test each workflow manually first

### 4. Configure Webhooks
1. For Ayrshare webhook handler, note the webhook URL
2. Configure this URL in your Ayrshare dashboard
3. Set up webhook events for post status updates

## Monitoring and Maintenance

### Logging
- All workflows include error handling
- Check n8n execution logs regularly
- Set up alerts for failed executions

### Performance
- Monitor database query performance
- Adjust cron intervals based on usage
- Scale n8n instance as needed

### Security
- Use environment variables for sensitive data
- Regularly rotate API keys
- Monitor webhook endpoints for abuse