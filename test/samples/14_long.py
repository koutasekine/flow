# 成績処理
n = int(input())
total = 0
best = -1
cnt = 0
i = 0
while i < n:
    s = int(input())
    if s < 0:
        print("不正な値")
        i = i + 1
        continue
    total = total + s
    if s > best:
        best = s
    if s >= 60:
        cnt = cnt + 1
    i = i + 1
print("合計", total)
print("最高", best)
if n > 0:
    avg = total / n
    print("平均", avg)
    for k in range(3):
        print("合格者数", cnt)
else:
    print("データなし")
print("終わり")
