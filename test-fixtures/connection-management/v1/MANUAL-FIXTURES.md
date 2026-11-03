# Manual connection samples

Select the registered **insrc** repository in Connections. Set a Connection ID; Label is optional. Both samples are inside that root and can use repository-relative paths.

| Driver | File path | Contents |
| --- | --- | --- |
| SQLite | `test-fixtures/connection-management/v1/manual-orders.sqlite` | `customers` (3 rows), `orders` (5 rows), `order_summary` view, foreign key and index |
| Parquet | `test-fixtures/connection-management/v1/manual-orders.parquet` | Five synthetic orders |

Enter/select the sample in the connection's **File path** field. The separate Schema Source path is optional and is for a Prisma schema, not the data file. Choose Saved or Temporary scope, then Test and Save as needed. Deleting/discarding a connection registration does not delete its source file.

SQLite sample query:

```sql
SELECT * FROM order_summary ORDER BY order_id;
```

All customer names, emails and order values are synthetic. The SQLite database has no external dependencies or credentials.
