package com.clueless.closet.service;

import java.util.Arrays;
import java.util.List;
import java.util.stream.Stream;

// Standard palette and legacy/internal aliases from ml/ml/vocab.py (FRONT_COLORS, COLOR_TO_FRONT).
public enum ClosetColor {
    WHITE("화이트", "#FFFDF7", "흰색", "하양", "하얀색", "백색"),
    IVORY("아이보리", "#F1E9D6"),
    BEIGE("베이지", "#D9C7A7"),
    CAMEL("카멜", "#C49A6C"),
    BROWN("브라운", "#6E4B32", "갈색"),
    BLACK("블랙", "#1E2235", "검정", "검정색", "검은색"),
    CHARCOAL("차콜", "#3E4049"),
    GRAY("그레이", "#A6A39B", "회색"),
    NAVY("네이비", "#26324F", "남색"),
    DENIM("데님", "#33467A", "블루"),
    SKY("스카이", "#9DBBD9", "스카이블루", "민트", "하늘색"),
    KHAKI("카키", "#6B6B3E"),
    GREEN("그린", "#2F5130", "청록", "초록", "초록색", "녹색"),
    BURGUNDY("버건디", "#7A2436", "와인"),
    RED("레드", "#C2353A", "빨강", "빨간색", "적색"),
    PINK("핑크", "#E7A9C2", "분홍", "분홍색"),
    YELLOW("옐로", "#E8C547", "오렌지", "노랑", "노란색"),
    PURPLE("퍼플", "#6C5A8E", "라벤더", "보라", "보라색");

    private final String label;
    private final String hex;
    private final List<String> storedLabels;

    ClosetColor(String label, String hex, String... aliases) {
        this.label = label;
        this.hex = hex;
        this.storedLabels = Stream.concat(Stream.of(label), Arrays.stream(aliases)).toList();
    }

    public String label() {
        return label;
    }

    public String hex() {
        return hex;
    }

    public List<String> storedLabels() {
        return storedLabels;
    }

    public static ClosetColor fromLabel(String label) {
        if (label != null) {
            String stripped = label.strip();
            for (var color : values()) {
                if (color.storedLabels.contains(stripped)) {
                    return color;
                }
            }
        }
        return null;
    }
}
