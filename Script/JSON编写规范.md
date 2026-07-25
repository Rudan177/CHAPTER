# JSON 编写规范

## 文件位置

- `wenben/chapter.json` — 正文文章数据
- `wenben/ss.json` — 自留地数据
- `wenben/` 目录下所有 `.json` 文件统一使用此规范

---

## 根结构

顶层是一个数组，每项代表一篇文章：

```json
[
    {
        "date": "2026年7月6日 星期一",
        "audio": "audio/260706.mp3",
        "blocks": [ ... ],
        "_footer": "未使用人工智能"
    }
]
```

### 文章级字段

| 字段 | 必填 | 类型 | 说明 |
|------|------|------|------|
| `date` | 是 | string | 文章日期 |
| `blocks` | 是 | array | 文章内容块列表 |
| `audio` | 否 | string | 关联音频路径 |
| `_footer` | 否 | string | 创作声明（以 `_` 开头表示私有/内部） |

**数组顺序**：越靠下时间越早（第 0 项为最新文章）。

---

## 内容块（`blocks` 数组）

每项是一个**单 key 对象**，key 名即 HTML 标签名，value 即内容。

| Key | Value 类型 | 对应 HTML | 说明 |
|-----|-----------|-----------|------|
| `h2` | string | `<h2>` | 二级标题（"创作相关"分类） |
| `h3` | string | `<h3>` | 文章内小标题 |
| `p` | string / array | `<p>` | 段落（纯文本用 string，含行内元素时用 array） |
| `ol` | string[] | `<ol>` | 有序列表 |
| `ul` | string[] | `<ul>` | 无序列表 |
| `se` | string | `<div class="se">` | 特殊元素（如"听全文"） |
| `img` | string | `<img>` | 图片，值即 `src` |

### 字段合并

`img` 可额外合并 `alt`、`style` 字段：

```json
{"img": "images/CL.png", "alt": "Civilized Language", "style": "width: 80%; max-width: 500px;"}
{"img": "images/dengshan.jpg", "alt": "图片描述", "style": "width: 80%; max-width: 500px; float: left; margin-right: 50px; margin-left: 15px;"}
```

---

## 行内元素（`p` 为 array 时）

当段落中包含链接、加粗、斜体、上标时，`p` 的值改为**混合数组**：

| 元素 | 写法 |
|------|------|
| 纯文本 | `"纯文本字符串"` |
| 链接 | `{"a": "显示文字", "href": "https://..."}` |
| 加粗 | `{"b": "加粗文字"}` |
| 斜体 | `{"em": "斜体文字"}` |
| 上标 | `{"sup": "上标内容"}` |

示例：

```json
{"p": [
    "这是一段普通文字，",
    {"b": "这部分加粗"},
    "，然后是",
    {"a": "链接文字", "href": "https://example.com"},
    "，最后是上标",
    {"sup": "[1]"},
    "。"
]}
```

---

## 速查示例

### 纯文本段落
```json
{"p": "这是一段纯文本内容。"}
```

### 含链接的段落
```json
{"p": [{"a": "下载链接", "href": "https://rudan177.github.io/OOOInterface/Interface/5.2.html"}, "下载最新版本。"]}
```

### 标题
```json
{"h2": "创作相关"}
{"h3": "OOO全新显示效果优化"}
```

### 列表
```json
{"ol": ["第一项", "第二项", "第三项"]}
{"ul": ["无序项A", "无序项B"]}
```

### 特殊元素
```json
{"se": "听全文"}
```

### 图片
```json
{"img": "images/CL.png", "alt": "Civilized Language", "style": "width: 80%; max-width: 500px;"}
```

### 完整文章示例
```json
{
    "date": "2026年7月6日 星期一",
    "audio": "audio/260706.mp3",
    "blocks": [
        {"se": "听全文"},
        {"h2": "创作相关"},
        {"h3": "OOO全新显示效果优化"},
        {"p": "原来为了提高用户基数……"},
        {"ol": ["新增暗色模式", "更改字体为鸿蒙字体"]},
        {"p": [
            {"a": "下载链接", "href": "https://rudan177.github.io/OOOInterface/Interface/5.2.html"},
            "下载最新版本。"
        ]},
        {"img": "images/CL.png", "alt": "Civilized Language", "style": "width: 80%; max-width: 500px;"}
    ],
    "_footer": "使用Tabbit浏览器内置GLM-5.1辅助创作"
}
```

---

## 注意事项

1. **不要使用 `id` 字段** — 数组下标即天然标识。
2. `_footer` 以 `_` 开头表示不直接渲染为 HTML 标签，由程序特殊处理。
3. `p` 为数组时，只有纯文本使用 `string`，所有带格式的元素必须使用 `object`。
4. 图片路径相对于站点根目录（如 `images/CL.png` 指向 `/images/CL.png`）。
5. 列表项均为 `string`，列表项中**不支持行内格式元素**。
6. 越新添加的文章越靠前——新文章追加到数组头部。
