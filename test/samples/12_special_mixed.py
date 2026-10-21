i = 0
while i < 100:
    i = i + 1
    if i % 2 == 0:
        continue
    if i > 50:
        if i % 7 == 0:
            break
    print(i)
