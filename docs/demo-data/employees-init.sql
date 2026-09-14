-- DataNova Demo Dataset (MySQL 8)
-- Minimal ecommerce schema + ~200 rows of seed data.
-- Load: docker exec -i <container> mysql -uroot -p<pwd> < employees-init.sql

SET NAMES utf8mb4;
SET time_zone = '+00:00';

DROP DATABASE IF EXISTS datanova_demo;
CREATE DATABASE datanova_demo CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE datanova_demo;

-- ─── customers ─────────────────────────────────────────────────────────
CREATE TABLE customers (
  id            INT PRIMARY KEY AUTO_INCREMENT,
  name          VARCHAR(64)  NOT NULL,
  email         VARCHAR(128) NOT NULL UNIQUE,
  region        VARCHAR(16)  NOT NULL,
  segment       VARCHAR(16)  NOT NULL,  -- 'consumer' | 'sme' | 'enterprise'
  created_at    DATETIME     NOT NULL,
  INDEX idx_region (region),
  INDEX idx_segment (segment),
  INDEX idx_created (created_at)
) ENGINE=InnoDB;

INSERT INTO customers (name, email, region, segment, created_at) VALUES
  ('北京小米科技',     'xiaomi@example.cn',    'cn-north', 'enterprise', '2024-01-15 09:00:00'),
  ('上海零售A',        'retail-a@example.cn',  'cn-east',  'consumer',   '2024-02-03 14:23:00'),
  ('广州物流',         'gz-logistics@example.cn','cn-south','sme',       '2024-02-20 11:45:00'),
  ('深圳硬件',         'sz-hw@example.cn',      'cn-south', 'enterprise', '2024-03-10 10:15:00'),
  ('成都餐饮',         'cd-eat@example.cn',     'cn-west',  'sme',        '2024-04-05 16:30:00'),
  ('杭州电商',         'hz-ec@example.cn',      'cn-east',  'consumer',   '2024-04-22 13:00:00'),
  ('武汉制造',         'wh-mfg@example.cn',     'cn-central','enterprise','2024-05-08 09:30:00'),
  ('西安教育',         'xa-edu@example.cn',     'cn-west',  'sme',        '2024-05-19 15:00:00'),
  ('南京服务',         'nj-svc@example.cn',     'cn-east',  'consumer',   '2024-06-01 10:00:00'),
  ('天津贸易',         'tj-trade@example.cn',   'cn-north', 'sme',        '2024-06-15 12:00:00');

-- ─── products ──────────────────────────────────────────────────────────
CREATE TABLE products (
  id          INT PRIMARY KEY AUTO_INCREMENT,
  sku         VARCHAR(32)  NOT NULL UNIQUE,
  name        VARCHAR(128) NOT NULL,
  category    VARCHAR(32)  NOT NULL,  -- 'electronics' | 'apparel' | 'food' | 'service'
  price_cents INT          NOT NULL,  -- 价格(分)
  cost_cents  INT          NOT NULL,
  active      TINYINT(1)   NOT NULL DEFAULT 1,
  INDEX idx_category (category)
) ENGINE=InnoDB;

INSERT INTO products (sku, name, category, price_cents, cost_cents, active) VALUES
  ('SKU-001', '机械键盘 K10',  'electronics', 49900, 28000, 1),
  ('SKU-002', '人体工学椅 Pro', 'furniture',   129900, 72000, 1),
  ('SKU-003', '保温杯 500ml',  'kitchen',      8900,  3500, 1),
  ('SKU-004', '背包 30L',      'apparel',     39900, 18000, 1),
  ('SKU-005', '无线鼠标 M2',   'electronics', 14900,  6000, 1),
  ('SKU-006', '咖啡豆 1kg',    'food',         9800,  4200, 1),
  ('SKU-007', '数据线套装',    'electronics',  2900,  800, 1),
  ('SKU-008', 'T恤 纯棉',      'apparel',      9900,  3500, 1);

-- ─── orders ────────────────────────────────────────────────────────────
CREATE TABLE orders (
  id           INT PRIMARY KEY AUTO_INCREMENT,
  customer_id  INT          NOT NULL,
  product_id   INT          NOT NULL,
  quantity     INT          NOT NULL,
  amount_cents INT          NOT NULL,
  status       VARCHAR(16)  NOT NULL,  -- 'paid' | 'refunded' | 'cancelled' | 'pending'
  created_at   DATETIME     NOT NULL,
  paid_at      DATETIME     NULL,
  INDEX idx_customer (customer_id),
  INDEX idx_product (product_id),
  INDEX idx_status (status),
  INDEX idx_created (created_at),
  INDEX idx_paid (paid_at),
  CONSTRAINT fk_orders_customer FOREIGN KEY (customer_id) REFERENCES customers(id),
  CONSTRAINT fk_orders_product  FOREIGN KEY (product_id)  REFERENCES products(id)
) ENGINE=InnoDB;

-- 生成约 200 笔订单，覆盖近 12 个月
DELIMITER //
CREATE PROCEDURE seed_orders()
BEGIN
  DECLARE i INT DEFAULT 0;
  WHILE i < 200 DO
    INSERT INTO orders (customer_id, product_id, quantity, amount_cents, status, created_at, paid_at)
    VALUES (
      1 + FLOOR(RAND() * 10),
      1 + FLOOR(RAND() * 8),
      1 + FLOOR(RAND() * 3),
      0,  -- 在下面 UPDATE
      ELT(1 + FLOOR(RAND() * 4), 'paid', 'paid', 'paid', 'pending'),
      DATE_SUB(NOW(), INTERVAL FLOOR(RAND() * 365) DAY),
      NULL
    );
    SET i = i + 1;
  END WHILE;
END //
DELIMITER ;

CALL seed_orders();
DROP PROCEDURE seed_orders;

-- 填充 amount_cents（基于 product 价格 × 数量）
UPDATE orders o JOIN products p ON o.product_id = p.id
SET o.amount_cents = p.price_cents * o.quantity;

-- paid 状态的订单填 paid_at = created_at + 1~30 分钟
UPDATE orders SET paid_at = DATE_ADD(created_at, INTERVAL FLOOR(1 + RAND() * 30) MINUTE)
WHERE status = 'paid';

-- ─── 视图：月营收（演示语义层可建指标）────────────────────────────────
CREATE OR REPLACE VIEW v_monthly_revenue AS
SELECT
  DATE_FORMAT(paid_at, '%Y-%m') AS month,
  SUM(amount_cents) / 100        AS revenue_yuan,
  COUNT(*)                        AS order_count,
  COUNT(DISTINCT customer_id)     AS customer_count
FROM orders
WHERE status = 'paid'
GROUP BY DATE_FORMAT(paid_at, '%Y-%m');

-- ─── 视图：客户分群金额（演示维度）────────────────────────────────────
CREATE OR REPLACE VIEW v_customer_segment_revenue AS
SELECT
  c.segment,
  c.region,
  DATE_FORMAT(o.paid_at, '%Y-%m') AS month,
  SUM(o.amount_cents) / 100       AS revenue_yuan,
  COUNT(DISTINCT o.id)             AS orders
FROM orders o
JOIN customers c ON o.customer_id = c.id
WHERE o.status = 'paid'
GROUP BY c.segment, c.region, DATE_FORMAT(o.paid_at, '%Y-%m');

-- ─── 演示结束 ─────────────────────────────────────────────────────────
SELECT
  'demo dataset loaded' AS status,
  (SELECT COUNT(*) FROM customers) AS customers,
  (SELECT COUNT(*) FROM products)  AS products,
  (SELECT COUNT(*) FROM orders)    AS orders,
  (SELECT COUNT(DISTINCT DATE_FORMAT(paid_at, '%Y-%m')) FROM orders WHERE status='paid') AS months;