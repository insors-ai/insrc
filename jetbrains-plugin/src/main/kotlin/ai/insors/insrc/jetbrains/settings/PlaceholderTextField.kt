package ai.insors.insrc.jetbrains.settings

import javax.swing.JTextField

/**
 * A text field that shows [placeholder] in grey while it is empty: the typical value of a repo's project type
 * for an unset Build command. The placeholder is only painted, never the field's text, so it is never written.
 */
internal class PlaceholderTextField(text: String, columns: Int, val placeholder: String?) : JTextField(text, columns) {
    override fun paintComponent(g: java.awt.Graphics) {
        super.paintComponent(g)
        val hint = placeholder
        if (hint != null && text.isEmpty()) {
            val g2 = g.create() as java.awt.Graphics2D
            try {
                g2.color = java.awt.Color.GRAY
                g2.drawString(hint, insets.left + 2, insets.top + g2.fontMetrics.ascent)
            } finally {
                g2.dispose()
            }
        }
    }
}
