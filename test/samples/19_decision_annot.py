x = 1
# check sign
if x > 0:
    y = 1
else:
    y = 2
while x < 10:  # loop
    x = x + 1
while True:
    x = int(input())
    # stop?
    if x < 0:
        break
    print(x)
